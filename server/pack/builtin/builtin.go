// This file (builtin.go, WP04) orchestrates WP02's CLI-JSON sourcing and
// WP03's file-scan sourcing into a single built-in scannedPack-shaped
// result, and bootstraps/upserts the single origin=built-in packs record
// (and its artifacts) at server startup.
package builtin

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/spec-kitty/pack-composer/server/cli"
	"github.com/spec-kitty/pack-composer/server/pack"
)

// historySourceImport / historySourceRefresh mirror pack_version_history's
// "source" select values (see server/collections/bootstrap.go). Duplicated
// as local constants rather than imported from server/handlers to avoid a
// handlers <-> pack/builtin import cycle (handlers already depends on this
// package for its origin=built-in checks and Bootstrap call).
const (
	historySourceImport  = "import"
	historySourceRefresh = "refresh"
)

// ProjectKey is the fixed, reserved project_key identifying the single
// built-in packs record. The parent-resolver (WP05) matches on generic
// project_key equality and does not need to special-case this constant.
const ProjectKey = "spec-kitty-builtin"

// Name is the display name for the built-in pack record.
const Name = "Spec Kitty Built-in"

// FallbackSourcePath is used as source_path when ResolveDoctrineDir fails,
// keeping the (non-unique, but still meaningful) source_path populated even
// on a host where WP03's file-scan sourcing can't resolve anything.
const FallbackSourcePath = "<builtin>"

// Sourced is the aggregated result of sourcing the built-in pack's content.
type Sourced struct {
	SourcePath string
	// Version is the installed spec-kitty CLI's own version (e.g.
	// "3.2.5"), used as the built-in pack's version so it tracks whichever
	// CLI is actually on PATH rather than a value Pack Composer invents.
	// Empty when it can't be resolved (CLI missing, unexpected --version
	// output) — this is not an error condition (research.md R6).
	Version   string
	Artifacts []pack.ParsedArtifact
}

// resolveCLIVersionFn is overridable in tests (mirrors resolveDoctrineDirFn's
// pattern in file_source.go).
var resolveCLIVersionFn = cli.ResolveCLIVersion

// StubResolveCLIVersionFn overrides resolveCLIVersionFn for tests. Call the
// returned restore func to reset.
func StubResolveCLIVersionFn(fn func() (string, error)) (restore func()) {
	prev := resolveCLIVersionFn
	resolveCLIVersionFn = fn
	return func() { resolveCLIVersionFn = prev }
}

// Source aggregates WP02's CLI-JSON sourcing and WP03's file-scan sourcing
// into a single result. It has no error return by design: both underlying
// sourcing functions already degrade to empty results on failure (per
// research.md R6), and doctrine-dir/CLI-version resolution failure here
// only affects the reported SourcePath/Version, not whether sourcing
// overall "succeeds".
func Source() Sourced {
	sourcePath, err := resolveDoctrineDirFn()
	if err != nil {
		sourcePath = FallbackSourcePath
	}

	version, _ := resolveCLIVersionFn()

	var artifacts []pack.ParsedArtifact
	artifacts = append(artifacts, SourceCLIArtifacts()...)
	artifacts = append(artifacts, SourceFileScanArtifacts()...)

	return Sourced{
		SourcePath: sourcePath,
		Version:    version,
		Artifacts:  artifacts,
	}
}

// Bootstrap upserts the single origin=built-in packs record (matched by its
// fixed ProjectKey, never by source_path) and replaces its pack_artifacts
// rows with whatever Source() currently discovers.
//
// This function must never fail for reasons unrelated to an actual database
// write failure: a zero-artifact Sourced result is not an error condition,
// only a genuine PocketBase transaction failure is. Callers (main.go) must
// treat any returned error as non-fatal to server startup (research.md R6).
func Bootstrap(app core.App) error {
	packsCol, err := app.FindCollectionByNameOrId("packs")
	if err != nil {
		return fmt.Errorf("builtin bootstrap: find packs collection: %w", err)
	}
	artsCol, err := app.FindCollectionByNameOrId("pack_artifacts")
	if err != nil {
		return fmt.Errorf("builtin bootstrap: find pack_artifacts collection: %w", err)
	}
	histCol, err := app.FindCollectionByNameOrId("pack_version_history")
	if err != nil {
		return fmt.Errorf("builtin bootstrap: find pack_version_history collection: %w", err)
	}

	existing, err := findBuiltinPack(app)
	if err != nil {
		return fmt.Errorf("builtin bootstrap: find existing record: %w", err)
	}

	sourced := Source()
	stats := pack.BuildStats(sourced.Artifacts)
	meta := pack.PackMetadata{Name: Name, ProjectKey: ProjectKey}
	snapshot := pack.BuildRawSnapshot(meta, sourced.Artifacts)

	now := types.NowDateTime()
	var packRec *core.Record
	prevVersion := ""
	isNew := existing == nil

	return app.RunInTransaction(func(txApp core.App) error {
		if isNew {
			packRec = core.NewRecord(packsCol)
			packRec.Set("imported_at", now)
		} else {
			var reErr error
			packRec, reErr = txApp.FindRecordById("packs", existing.Id)
			if reErr != nil {
				return fmt.Errorf("builtin bootstrap: reload existing record: %w", reErr)
			}
			prevVersion = packRec.GetString("version")
		}

		packRec.Set("origin", "built-in")
		packRec.Set("project_key", ProjectKey)
		packRec.Set("name", Name)
		packRec.Set("source_path", sourced.SourcePath)
		packRec.Set("parent_id", "")
		packRec.Set("version", sourced.Version)
		packRec.Set("updated_at", now)
		packRec.Set("stats", statsToJSON(stats))
		packRec.Set("raw_snapshot", snapshot)
		packRec.Set("validation_status", "unknown")
		// The built-in pack is never run through spec-kitty's pack
		// validator (it isn't scanned as a conventional pack root), so any
		// validation_errors value is stale by definition. Explicitly clear
		// it on every Bootstrap run rather than leaving whatever a prior
		// (e.g. buggy generic-refresh) write left behind.
		packRec.Set("validation_errors", nil)

		if err := txApp.Save(packRec); err != nil {
			return fmt.Errorf("builtin bootstrap: save pack: %w", err)
		}

		if err := replaceArtifacts(txApp, artsCol, packRec.Id, sourced.Artifacts); err != nil {
			return fmt.Errorf("builtin bootstrap: replace artifacts: %w", err)
		}

		// Record a version_history entry whenever the resolved CLI version
		// is known and changed (or this is the first Bootstrap), mirroring
		// handlers/store.go's persistScannedPack behavior for local/remote
		// packs. An unresolvable version (empty string) is not "new" or
		// "changed" in any meaningful sense, so it's never recorded.
		if sourced.Version != "" && (isNew || sourced.Version != prevVersion) {
			hist := core.NewRecord(histCol)
			hist.Set("pack", packRec.Id)
			hist.Set("version", sourced.Version)
			hist.Set("observed_at", now)
			if isNew {
				hist.Set("source", historySourceImport)
			} else {
				hist.Set("source", historySourceRefresh)
			}
			if err := txApp.Save(hist); err != nil {
				return fmt.Errorf("builtin bootstrap: save version history: %w", err)
			}
		}

		return nil
	})
}

// findBuiltinPack looks up the built-in packs record, preferring its fixed
// ProjectKey but falling back to origin=built-in. The fallback self-heals
// installs that hit a since-fixed bug where refreshing the built-in pack
// through the generic disk-scan path (server/handlers/refresh.go, before it
// special-cased origin=built-in) overwrote project_key with whatever (empty)
// value it derived from scanning the raw doctrine directory, which has no
// org-charter.yaml. Without this fallback, that corrupted record would
// become permanently invisible to future Bootstrap runs — which would then
// try to insert a second record and fail on source_path's uniqueness
// constraint, per handlers/store.go's origin=local pattern.
// Returns (nil, nil) when neither lookup finds a record.
func findBuiltinPack(app core.App) (*core.Record, error) {
	rec, err := app.FindFirstRecordByFilter(
		"packs",
		"project_key = {:pk}",
		dbx.Params{"pk": ProjectKey},
	)
	if err == nil {
		return rec, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	rec, err = app.FindFirstRecordByFilter(
		"packs",
		"origin = {:origin}",
		dbx.Params{"origin": "built-in"},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return rec, nil
}

// replaceArtifacts deletes all existing pack_artifacts rows for packID and
// inserts the new set, mirroring handlers/store.go's replaceArtifacts.
// Duplicated locally (rather than imported from server/handlers) to avoid a
// handlers <-> pack/builtin import cycle: WP06 handlers need this package's
// exported constants/origin check, so handlers must not be a dependency here.
func replaceArtifacts(app core.App, artsCol *core.Collection, packID string, artifacts []pack.ParsedArtifact) error {
	existing, err := app.FindRecordsByFilter(
		"pack_artifacts",
		"pack={:pack}",
		"",
		0,
		0,
		dbx.Params{"pack": packID},
	)
	if err != nil {
		return fmt.Errorf("list artifacts: %w", err)
	}
	for _, old := range existing {
		if err := app.Delete(old); err != nil {
			return fmt.Errorf("delete artifact %s: %w", old.Id, err)
		}
	}

	for _, a := range artifacts {
		rec := core.NewRecord(artsCol)
		rec.Set("pack", packID)
		rec.Set("artifact_type", string(a.ArtifactType))
		rec.Set("artifact_id", a.ArtifactID)
		rec.Set("name", a.Name)
		rec.Set("category", a.Category)
		rec.Set("parse_ok", a.ParseOK)
		rec.Set("parse_error", a.ParseError)
		rec.Set("content", a.Content)
		rec.Set("source_relative_path", a.SourceRelativePath)
		if len(a.Roles) > 0 {
			rec.Set("roles", a.Roles)
		}
		if len(a.DomainKeywords) > 0 {
			rec.Set("domain_keywords", a.DomainKeywords)
		}
		if err := app.Save(rec); err != nil {
			return fmt.Errorf("save artifact %s: %w", a.SourceRelativePath, err)
		}
	}
	return nil
}

func statsToJSON(s pack.Stats) map[string]any {
	return map[string]any{
		"total":   s.Total,
		"by_type": s.ByType,
	}
}
