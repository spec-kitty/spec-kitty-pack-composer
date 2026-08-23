package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/spec-kitty/pack-composer/server/cli"
	"github.com/spec-kitty/pack-composer/server/pack"
)

// historySource values for pack_version_history.source.
const (
	historySourceImport  = "import"
	historySourceRefresh = "refresh"
)

// scannedPack is the in-memory result of scan + parse + metadata (+ optional validate).
type scannedPack struct {
	Root       string
	Meta       pack.PackMetadata
	Artifacts  []pack.ParsedArtifact
	Stats      pack.Stats
	Snapshot   map[string]any
	Validation *cli.ValidationResult
}

// ErrNoArtifacts is returned when a pack path has zero recognizable artifacts.
var ErrNoArtifacts = errors.New("no recognizable artifacts")

// loadPackFromDisk scans, parses, and extracts metadata for sourcePath.
// Zero artifacts → ErrNoArtifacts (map to HTTP 400). Path errors wrap os errors.
func loadPackFromDisk(sourcePath string, runValidate bool) (*scannedPack, error) {
	root, err := filepath.Abs(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("resolve path: %w", err)
	}
	info, err := os.Stat(root)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%s is not a directory", root)
	}

	files, err := pack.Scan(root)
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, ErrNoArtifacts
	}

	artifacts, err := pack.ParseAll(root, files)
	if err != nil {
		return nil, err
	}

	meta, err := pack.ExtractMetadata(root)
	if err != nil {
		return nil, err
	}

	sp := &scannedPack{
		Root:      root,
		Meta:      meta,
		Artifacts: artifacts,
		Stats:     pack.BuildStats(artifacts),
		Snapshot:  pack.BuildRawSnapshot(meta, artifacts),
	}

	if runValidate {
		result, verr := cli.ValidatePack(root)
		if verr != nil {
			if errors.Is(verr, cli.ErrCLINotInstalled) {
				sp.Validation = &cli.ValidationResult{
					Status: cli.StatusUnknown,
					Errors: []string{verr.Error()},
				}
			} else {
				return nil, verr
			}
		} else {
			sp.Validation = result
		}
	}

	return sp, nil
}

func findPackBySourcePath(app core.App, sourcePath string) (*core.Record, error) {
	rec, err := app.FindFirstRecordByFilter(
		"packs",
		"source_path={:path}",
		dbx.Params{"path": sourcePath},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return rec, nil
}

func findPackByID(app core.App, id string) (*core.Record, error) {
	rec, err := app.FindRecordById("packs", id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return rec, nil
}

// persistScannedPack creates or updates a pack record and replaces artifacts.
// Duplicate source_path upserts (research R8). historySource is import|refresh.
func persistScannedPack(app core.App, existing *core.Record, sp *scannedPack, historySource string) (*core.Record, error) {
	packsCol, err := app.FindCollectionByNameOrId("packs")
	if err != nil {
		return nil, err
	}
	artsCol, err := app.FindCollectionByNameOrId("pack_artifacts")
	if err != nil {
		return nil, err
	}
	histCol, err := app.FindCollectionByNameOrId("pack_version_history")
	if err != nil {
		return nil, err
	}

	now := types.NowDateTime()
	var packRec *core.Record
	prevVersion := ""
	isNew := existing == nil

	err = app.RunInTransaction(func(txApp core.App) error {
		if isNew {
			packRec = core.NewRecord(packsCol)
			packRec.Set("source_path", sp.Root)
			packRec.Set("origin", "local")
			packRec.Set("imported_at", now)
		} else {
			// Re-load inside the transaction for a consistent write set.
			packRec, err = txApp.FindRecordById("packs", existing.Id)
			if err != nil {
				return err
			}
			prevVersion = packRec.GetString("version")
		}

		packRec.Set("name", sp.Meta.Name)
		packRec.Set("description", sp.Meta.Description)
		packRec.Set("project_key", sp.Meta.ProjectKey)
		packRec.Set("parent_id", sp.Meta.ParentID)
		packRec.Set("version", sp.Meta.Version)
		packRec.Set("updated_at", now)
		packRec.Set("links", linksToJSON(sp.Meta.Links))
		packRec.Set("stats", statsToJSON(sp.Stats))
		packRec.Set("raw_snapshot", sp.Snapshot)

		if sp.Validation != nil {
			packRec.Set("validation_status", string(sp.Validation.Status))
			packRec.Set("validation_errors", sp.Validation.Errors)
		} else if isNew {
			packRec.Set("validation_status", string(cli.StatusUnknown))
		}

		if err := txApp.Save(packRec); err != nil {
			return fmt.Errorf("save pack: %w", err)
		}

		if err := replaceArtifacts(txApp, artsCol, packRec.Id, sp.Artifacts); err != nil {
			return err
		}

		shouldAppend := false
		if sp.Meta.Version != "" {
			if isNew || sp.Meta.Version != prevVersion {
				shouldAppend = true
			}
		}
		if shouldAppend {
			hist := core.NewRecord(histCol)
			hist.Set("pack", packRec.Id)
			hist.Set("version", sp.Meta.Version)
			hist.Set("observed_at", now)
			hist.Set("source", historySource)
			if err := txApp.Save(hist); err != nil {
				return fmt.Errorf("save version history: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return packRec, nil
}

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
		rec.Set("provenance_status", string(a.Provenance.Status))
		rec.Set("provenance", a.Provenance)
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

func linksToJSON(links []pack.Link) []map[string]string {
	out := make([]map[string]string, 0, len(links))
	for _, l := range links {
		out = append(out, map[string]string{"label": l.Label, "url": l.URL})
	}
	return out
}

func statsToJSON(s pack.Stats) map[string]any {
	return map[string]any{
		"total":   s.Total,
		"by_type": s.ByType,
	}
}
