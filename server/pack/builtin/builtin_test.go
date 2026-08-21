package builtin

import (
	"encoding/json"
	"errors"
	"os/exec"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/spec-kitty/pack-composer/server/cli"
	"github.com/spec-kitty/pack-composer/server/collections"
)

func newBootstrappedTestApp(t *testing.T) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)
	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("collections.Bootstrap: %v", err)
	}
	return app
}

// stubZeroSourcing simulates a host with no spec-kitty install: CLI lookup
// fails and doctrine-dir resolution fails, so Source() returns zero
// artifacts and the fallback source path.
func stubZeroSourcing(t *testing.T) {
	t.Helper()
	restoreLook := cli.StubLookPath(func(string) (string, error) {
		return "", errors.New("not found")
	})
	t.Cleanup(restoreLook)
	restoreDoctrine := StubResolveDoctrineDirFn(func() (string, error) {
		return "", errors.New("no doctrine install")
	})
	t.Cleanup(restoreDoctrine)
}

func TestBootstrapSingleRecordWhenSourcingFullyFails(t *testing.T) {
	app := newBootstrappedTestApp(t)
	stubZeroSourcing(t)

	if err := Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	recs, err := app.FindRecordsByFilter("packs", "origin = {:o}", "", 0, 0, dbx.Params{"o": "built-in"})
	if err != nil {
		t.Fatalf("find built-in packs: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("want exactly 1 built-in pack record, got %d", len(recs))
	}

	rec := recs[0]
	if rec.GetString("source_path") != FallbackSourcePath {
		t.Errorf("source_path = %q, want fallback %q", rec.GetString("source_path"), FallbackSourcePath)
	}
	if rec.GetString("project_key") != ProjectKey {
		t.Errorf("project_key = %q, want %q", rec.GetString("project_key"), ProjectKey)
	}
	if rec.GetString("parent_id") != "" {
		t.Errorf("parent_id = %q, want empty", rec.GetString("parent_id"))
	}

	var stats struct {
		Total int `json:"total"`
	}
	if err := json.Unmarshal([]byte(rec.GetString("stats")), &stats); err != nil {
		t.Fatalf("unmarshal stats: %v (raw=%q)", err, rec.GetString("stats"))
	}
	if stats.Total != 0 {
		t.Errorf("stats.total = %d, want 0", stats.Total)
	}
}

// Regression: a since-fixed bug (generic disk-scan refresh path) could
// leave stale validation_errors on the built-in pack record from scanning
// content that was never structured as a pack. The built-in pack is never
// run through spec-kitty's pack validator, so Bootstrap must clear any
// leftover validation_errors on every run rather than leaving them in place
// indefinitely once written.
func TestBootstrapClearsStaleValidationErrors(t *testing.T) {
	app := newBootstrappedTestApp(t)
	stubZeroSourcing(t)

	if err := Bootstrap(app); err != nil {
		t.Fatalf("first Bootstrap: %v", err)
	}

	rec, err := app.FindFirstRecordByFilter("packs", "origin = {:o}", dbx.Params{"o": "built-in"})
	if err != nil {
		t.Fatalf("find built-in pack: %v", err)
	}
	rec.Set("validation_status", "errors")
	rec.Set("validation_errors", []string{"stale duplicate_id error from a generic disk scan"})
	if err := app.Save(rec); err != nil {
		t.Fatalf("simulate stale validation state: %v", err)
	}

	if err := Bootstrap(app); err != nil {
		t.Fatalf("second Bootstrap: %v", err)
	}

	reloaded, err := app.FindRecordById("packs", rec.Id)
	if err != nil {
		t.Fatalf("reload built-in pack: %v", err)
	}
	if got := reloaded.GetString("validation_status"); got != "unknown" {
		t.Errorf("validation_status = %q, want %q", got, "unknown")
	}
	if raw := reloaded.GetString("validation_errors"); raw != "" && raw != "null" && raw != "[]" {
		t.Errorf("validation_errors = %q, want cleared", raw)
	}
}

func TestBootstrapIsIdempotentAcrossRuns(t *testing.T) {
	app := newBootstrappedTestApp(t)
	stubZeroSourcing(t)

	if err := Bootstrap(app); err != nil {
		t.Fatalf("first Bootstrap: %v", err)
	}
	if err := Bootstrap(app); err != nil {
		t.Fatalf("second Bootstrap: %v", err)
	}

	recs, err := app.FindRecordsByFilter("packs", "origin = {:o}", "", 0, 0, dbx.Params{"o": "built-in"})
	if err != nil {
		t.Fatalf("find built-in packs: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("want exactly 1 built-in pack record after two Bootstrap calls, got %d", len(recs))
	}
}

// Regression: a since-fixed bug (server/handlers/refresh.go treating the
// built-in pack like any other disk-scanned pack) could overwrite its
// project_key with an empty string, since the raw doctrine directory has
// no org-charter.yaml to derive one from. Bootstrap must still find and
// update that record on the next run (matching by origin=built-in as a
// fallback) rather than attempting to insert a second one, which would
// fail on source_path's uniqueness constraint and leave the corrupted
// record stuck forever.
func TestBootstrapSelfHealsRecordWithCorruptedProjectKey(t *testing.T) {
	app := newBootstrappedTestApp(t)
	stubZeroSourcing(t)

	if err := Bootstrap(app); err != nil {
		t.Fatalf("first Bootstrap: %v", err)
	}

	rec, err := app.FindFirstRecordByFilter("packs", "origin = {:o}", dbx.Params{"o": "built-in"})
	if err != nil {
		t.Fatalf("find built-in pack: %v", err)
	}
	rec.Set("project_key", "")
	rec.Set("name", "Doctrine")
	if err := app.Save(rec); err != nil {
		t.Fatalf("simulate corruption: %v", err)
	}

	if err := Bootstrap(app); err != nil {
		t.Fatalf("second Bootstrap (should self-heal): %v", err)
	}

	recs, err := app.FindRecordsByFilter("packs", "origin = {:o}", "", 0, 0, dbx.Params{"o": "built-in"})
	if err != nil {
		t.Fatalf("find built-in packs: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("want exactly 1 built-in pack record after self-heal, got %d", len(recs))
	}
	if recs[0].Id != rec.Id {
		t.Fatalf("expected the same record (id=%s) to be updated in place, got id=%s", rec.Id, recs[0].Id)
	}
	if recs[0].GetString("project_key") != ProjectKey {
		t.Errorf("project_key = %q, want restored %q", recs[0].GetString("project_key"), ProjectKey)
	}
	if recs[0].GetString("name") != Name {
		t.Errorf("name = %q, want restored %q", recs[0].GetString("name"), Name)
	}
}

// The built-in pack's version tracks the installed spec-kitty CLI's own
// version, not a value Pack Composer invents, so it stays meaningful across
// CLI upgrades without any special-casing on Pack Composer's side.
func TestBootstrapSetsVersionFromResolvedCLIVersion(t *testing.T) {
	app := newBootstrappedTestApp(t)
	stubZeroSourcing(t)
	restoreVersion := StubResolveCLIVersionFn(func() (string, error) { return "3.2.5", nil })
	t.Cleanup(restoreVersion)

	if err := Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	rec, err := app.FindFirstRecordByFilter("packs", "origin = {:o}", dbx.Params{"o": "built-in"})
	if err != nil {
		t.Fatalf("find built-in pack: %v", err)
	}
	if got := rec.GetString("version"); got != "3.2.5" {
		t.Errorf("version = %q, want %q", got, "3.2.5")
	}

	hist, err := app.FindRecordsByFilter("pack_version_history", "pack = {:p}", "", 0, 0, dbx.Params{"p": rec.Id})
	if err != nil {
		t.Fatalf("find version history: %v", err)
	}
	if len(hist) != 1 {
		t.Fatalf("want exactly 1 version_history entry after first Bootstrap, got %d", len(hist))
	}
	if got := hist[0].GetString("version"); got != "3.2.5" {
		t.Errorf("history version = %q, want %q", got, "3.2.5")
	}
	if got := hist[0].GetString("source"); got != "import" {
		t.Errorf("history source = %q, want %q", got, "import")
	}
}

// Regression guard on the inverse: an unresolvable CLI version (empty
// string) must not be recorded as a version_history entry — it isn't a
// real version, just "unknown".
func TestBootstrapUnresolvableVersionRecordsNoHistory(t *testing.T) {
	app := newBootstrappedTestApp(t)
	stubZeroSourcing(t)

	if err := Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	rec, err := app.FindFirstRecordByFilter("packs", "origin = {:o}", dbx.Params{"o": "built-in"})
	if err != nil {
		t.Fatalf("find built-in pack: %v", err)
	}
	if got := rec.GetString("version"); got != "" {
		t.Errorf("version = %q, want empty", got)
	}

	hist, err := app.FindRecordsByFilter("pack_version_history", "pack = {:p}", "", 0, 0, dbx.Params{"p": rec.Id})
	if err != nil {
		t.Fatalf("find version history: %v", err)
	}
	if len(hist) != 0 {
		t.Fatalf("want 0 version_history entries for an unresolvable version, got %d", len(hist))
	}
}

// A version_history entry is only appended when the CLI version actually
// changes between Bootstrap runs, mirroring handlers/store.go's behavior
// for local/remote packs.
func TestBootstrapRecordsHistoryOnlyOnVersionChange(t *testing.T) {
	app := newBootstrappedTestApp(t)
	stubZeroSourcing(t)

	version := "3.2.5"
	restoreVersion := StubResolveCLIVersionFn(func() (string, error) { return version, nil })
	t.Cleanup(restoreVersion)

	if err := Bootstrap(app); err != nil {
		t.Fatalf("first Bootstrap: %v", err)
	}
	if err := Bootstrap(app); err != nil {
		t.Fatalf("second Bootstrap (same version): %v", err)
	}

	rec, err := app.FindFirstRecordByFilter("packs", "origin = {:o}", dbx.Params{"o": "built-in"})
	if err != nil {
		t.Fatalf("find built-in pack: %v", err)
	}
	hist, err := app.FindRecordsByFilter("pack_version_history", "pack = {:p}", "", 0, 0, dbx.Params{"p": rec.Id})
	if err != nil {
		t.Fatalf("find version history: %v", err)
	}
	if len(hist) != 1 {
		t.Fatalf("want exactly 1 version_history entry across two same-version Bootstrap runs, got %d", len(hist))
	}

	version = "3.3.0"
	if err := Bootstrap(app); err != nil {
		t.Fatalf("third Bootstrap (new version): %v", err)
	}
	hist, err = app.FindRecordsByFilter("pack_version_history", "pack = {:p}", "", 0, 0, dbx.Params{"p": rec.Id})
	if err != nil {
		t.Fatalf("find version history: %v", err)
	}
	if len(hist) != 2 {
		t.Fatalf("want 2 version_history entries after a version change, got %d", len(hist))
	}
}

func TestBootstrapPersistsNonEmptyArtifacts(t *testing.T) {
	app := newBootstrappedTestApp(t)

	// Doctrine-dir resolution (file-scan half) stays unresolved; only the
	// CLI-JSON half is stubbed to report one directive.
	restoreDoctrine := StubResolveDoctrineDirFn(func() (string, error) {
		return "", errors.New("no doctrine install")
	})
	t.Cleanup(restoreDoctrine)

	restoreLook := cli.StubLookPath(func(string) (string, error) { return "/usr/bin/spec-kitty", nil })
	t.Cleanup(restoreLook)

	directiveListScript := writeFakeScript(t, `#!/bin/sh
echo '{"all_directives": [{"id": "DIRECTIVE_001", "source": "builtin"}]}'
`)
	emptyProfileListScript := writeFakeScript(t, `#!/bin/sh
echo '{"profiles": []}'
`)
	directiveContentScript := writeFakeScript(t, `#!/bin/sh
printf 'Full artifact:\n{"id": "DIRECTIVE_001", "title": "Example Directive"}\n'
`)

	restoreCmd := cli.StubCommandFactory(func(_ string, args ...string) *exec.Cmd {
		joined := strings.Join(args, " ")
		switch {
		case strings.Contains(joined, "profiles list"):
			return exec.Command(emptyProfileListScript)
		case strings.Contains(joined, "--include directive:"):
			return exec.Command(directiveContentScript)
		default:
			return exec.Command(directiveListScript)
		}
	})
	t.Cleanup(restoreCmd)

	if err := Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	recs, err := app.FindRecordsByFilter("packs", "origin = {:o}", "", 0, 0, dbx.Params{"o": "built-in"})
	if err != nil || len(recs) != 1 {
		t.Fatalf("find built-in pack: recs=%d err=%v", len(recs), err)
	}
	packID := recs[0].Id

	artifacts, err := app.FindRecordsByFilter("pack_artifacts", "pack = {:id}", "", 0, 0, dbx.Params{"id": packID})
	if err != nil {
		t.Fatalf("find pack_artifacts: %v", err)
	}
	if len(artifacts) != 1 {
		t.Fatalf("want exactly 1 persisted artifact, got %d", len(artifacts))
	}
	if artifacts[0].GetString("artifact_id") != "DIRECTIVE_001" {
		t.Errorf("artifact_id = %q, want DIRECTIVE_001", artifacts[0].GetString("artifact_id"))
	}
}
