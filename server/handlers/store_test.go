package handlers

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/spec-kitty/pack-composer/server/collections"
)

func TestPersistScannedPackUpsertBySourcePath(t *testing.T) {
	t.Parallel()

	app, cleanup := newTestApp(t)
	defer cleanup()

	root := writeSamplePack(t, "1.0.0")

	sp, err := loadPackFromDisk(root, false)
	if err != nil {
		t.Fatalf("load: %v", err)
	}

	rec1, err := persistScannedPack(app, nil, sp, historySourceImport)
	if err != nil {
		t.Fatalf("persist new: %v", err)
	}
	if rec1.GetString("origin") != "local" {
		t.Fatalf("origin=%q want local", rec1.GetString("origin"))
	}

	arts, err := app.FindRecordsByFilter("pack_artifacts", "pack={:p}", "", 0, 0, dbx.Params{"p": rec1.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(arts) == 0 {
		t.Fatal("expected artifacts")
	}
	firstArtCount := len(arts)

	hist, err := app.FindRecordsByFilter("pack_version_history", "pack={:p}", "", 0, 0, dbx.Params{"p": rec1.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(hist) != 1 {
		t.Fatalf("want 1 history row on first import, got %d", len(hist))
	}

	mustWrite(t, filepath.Join(root, "b.tactic.yaml"), "id: B\ntitle: Tactic B\n")
	mustWrite(t, filepath.Join(root, ".pack-version"), "2.0.0\n")

	sp2, err := loadPackFromDisk(root, false)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	existing, err := findPackBySourcePath(app, sp2.Root)
	if err != nil || existing == nil {
		t.Fatalf("find existing: %v %v", existing, err)
	}
	rec2, err := persistScannedPack(app, existing, sp2, historySourceRefresh)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if rec2.Id != rec1.Id {
		t.Fatalf("upsert created new id %s vs %s", rec2.Id, rec1.Id)
	}
	if rec2.GetString("version") != "2.0.0" {
		t.Fatalf("version=%q want 2.0.0", rec2.GetString("version"))
	}

	arts2, err := app.FindRecordsByFilter("pack_artifacts", "pack={:p}", "", 0, 0, dbx.Params{"p": rec2.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(arts2) <= firstArtCount {
		t.Fatalf("expected more artifacts after upsert, got %d (was %d)", len(arts2), firstArtCount)
	}

	hist2, err := app.FindRecordsByFilter("pack_version_history", "pack={:p}", "-observed_at", 0, 0, dbx.Params{"p": rec2.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(hist2) != 2 {
		t.Fatalf("want 2 history rows after version change, got %d", len(hist2))
	}

	all, err := app.FindRecordsByFilter("packs", "source_path={:p}", "", 0, 0, dbx.Params{"p": sp2.Root})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 {
		t.Fatalf("want 1 pack for source_path, got %d", len(all))
	}
}

func TestPersistScannedPackSetsParentID(t *testing.T) {
	t.Parallel()

	app, cleanup := newTestApp(t)
	defer cleanup()

	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "README.md"), "# Sample Pack\n\nA demo pack.\n")
	mustWrite(t, filepath.Join(root, ".pack-version"), "1.0.0\n")
	mustWrite(t, filepath.Join(root, "org-charter.yaml"), "org_name: acme\nextends: acme-parent\n")
	mustWrite(t, filepath.Join(root, "a.directive.yaml"), "id: A\ntitle: Directive A\ncategory: core\n")

	sp, err := loadPackFromDisk(root, false)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if sp.Meta.ParentID != "acme-parent" {
		t.Fatalf("Meta.ParentID = %q, want acme-parent", sp.Meta.ParentID)
	}

	rec, err := persistScannedPack(app, nil, sp, historySourceImport)
	if err != nil {
		t.Fatalf("persist new: %v", err)
	}
	if rec.GetString("parent_id") != "acme-parent" {
		t.Fatalf("parent_id=%q want acme-parent", rec.GetString("parent_id"))
	}

	// Round-trip through a fresh lookup.
	reloaded, err := app.FindRecordById("packs", rec.Id)
	if err != nil {
		t.Fatalf("FindRecordById: %v", err)
	}
	if reloaded.GetString("parent_id") != "acme-parent" {
		t.Fatalf("reloaded parent_id=%q want acme-parent", reloaded.GetString("parent_id"))
	}

	// Update path: re-persist with an updated ParentID and confirm it's set too.
	sp.Meta.ParentID = "acme-parent-v2"
	existing, err := findPackBySourcePath(app, sp.Root)
	if err != nil || existing == nil {
		t.Fatalf("find existing: %v %v", existing, err)
	}
	rec2, err := persistScannedPack(app, existing, sp, historySourceRefresh)
	if err != nil {
		t.Fatalf("persist update: %v", err)
	}
	if rec2.GetString("parent_id") != "acme-parent-v2" {
		t.Fatalf("updated parent_id=%q want acme-parent-v2", rec2.GetString("parent_id"))
	}
}

func TestPersistScannedPackEmptyParentIDIsNotAnError(t *testing.T) {
	t.Parallel()

	app, cleanup := newTestApp(t)
	defer cleanup()

	root := writeSamplePack(t, "1.0.0")
	sp, err := loadPackFromDisk(root, false)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if sp.Meta.ParentID != "" {
		t.Fatalf("Meta.ParentID = %q, want empty (no org-charter.yaml)", sp.Meta.ParentID)
	}

	rec, err := persistScannedPack(app, nil, sp, historySourceImport)
	if err != nil {
		t.Fatalf("persist: %v", err)
	}
	if rec.GetString("parent_id") != "" {
		t.Fatalf("parent_id=%q want empty", rec.GetString("parent_id"))
	}
}

func TestLoadPackFromDiskRejectsEmpty(t *testing.T) {
	t.Parallel()
	empty := t.TempDir()
	_, err := loadPackFromDisk(empty, false)
	if err == nil {
		t.Fatal("expected error for empty pack")
	}
	if !errors.Is(err, ErrNoArtifacts) {
		t.Fatalf("want ErrNoArtifacts, got %v", err)
	}
}

func TestCascadeDeleteArtifacts(t *testing.T) {
	t.Parallel()

	app, cleanup := newTestApp(t)
	defer cleanup()

	root := writeSamplePack(t, "1.0.0")
	sp, err := loadPackFromDisk(root, false)
	if err != nil {
		t.Fatal(err)
	}
	rec, err := persistScannedPack(app, nil, sp, historySourceImport)
	if err != nil {
		t.Fatal(err)
	}

	if err := app.Delete(rec); err != nil {
		t.Fatal(err)
	}
	arts, err := app.FindRecordsByFilter("pack_artifacts", "pack={:p}", "", 0, 0, dbx.Params{"p": rec.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(arts) != 0 {
		t.Fatalf("cascade should remove artifacts, got %d", len(arts))
	}
}

func newTestApp(t *testing.T) (*tests.TestApp, func()) {
	t.Helper()
	dataDir := t.TempDir()
	app, err := tests.NewTestApp(dataDir)
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	if err := collections.Bootstrap(app); err != nil {
		app.Cleanup()
		t.Fatalf("Bootstrap: %v", err)
	}
	return app, app.Cleanup
}

func writeSamplePack(t *testing.T, version string) string {
	t.Helper()
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "README.md"), "# Sample Pack\n\nA demo pack.\n")
	mustWrite(t, filepath.Join(root, ".pack-version"), version+"\n")
	mustWrite(t, filepath.Join(root, "a.directive.yaml"), "id: A\ntitle: Directive A\ncategory: core\n")
	return root
}

func mustWrite(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
