package collections_test

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/spec-kitty/pack-composer/server/collections"
)

func TestBootstrapCreatesCollectionsAndCascadeDelete(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	app, err := tests.NewTestApp(dataDir)
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	packs, err := app.FindCollectionByNameOrId("packs")
	if err != nil {
		t.Fatalf("packs collection: %v", err)
	}
	artifacts, err := app.FindCollectionByNameOrId("pack_artifacts")
	if err != nil {
		t.Fatalf("pack_artifacts collection: %v", err)
	}
	history, err := app.FindCollectionByNameOrId("pack_version_history")
	if err != nil {
		t.Fatalf("pack_version_history collection: %v", err)
	}

	assertField(t, packs, "source_path")
	assertField(t, packs, "imported_at")
	assertField(t, artifacts, "artifact_type")
	assertField(t, history, "observed_at")

	if !hasUniqueIndex(packs, "source_path") {
		t.Fatal("expected unique index on packs.source_path")
	}

	packRel := artifacts.Fields.GetByName("pack").(*core.RelationField)
	if !packRel.CascadeDelete {
		t.Fatal("pack_artifacts.pack must cascade delete")
	}
	histRel := history.Fields.GetByName("pack").(*core.RelationField)
	if !histRel.CascadeDelete {
		t.Fatal("pack_version_history.pack must cascade delete")
	}

	now := types.NowDateTime()
	pack := core.NewRecord(packs)
	pack.Set("name", "demo")
	pack.Set("source_path", filepath.Join(dataDir, "demo-pack"))
	pack.Set("origin", "local")
	pack.Set("validation_status", "unknown")
	pack.Set("imported_at", now)
	pack.Set("updated_at", now)
	if err := app.Save(pack); err != nil {
		t.Fatalf("save pack: %v", err)
	}

	art := core.NewRecord(artifacts)
	art.Set("pack", pack.Id)
	art.Set("artifact_type", "directive")
	art.Set("artifact_id", "D1")
	art.Set("name", "Demo")
	art.Set("parse_ok", true)
	art.Set("source_relative_path", "demo.directive.yaml")
	if err := app.Save(art); err != nil {
		t.Fatalf("save artifact: %v", err)
	}

	hist := core.NewRecord(history)
	hist.Set("pack", pack.Id)
	hist.Set("version", "0.1.0")
	hist.Set("observed_at", now)
	hist.Set("source", "import")
	if err := app.Save(hist); err != nil {
		t.Fatalf("save history: %v", err)
	}

	if err := app.Delete(pack); err != nil {
		t.Fatalf("delete pack: %v", err)
	}

	if _, err := app.FindRecordById(artifacts.Id, art.Id); err == nil {
		t.Fatal("expected artifact cascade-deleted with pack")
	}
	if _, err := app.FindRecordById(history.Id, hist.Id); err == nil {
		t.Fatal("expected version history cascade-deleted with pack")
	}

	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("second Bootstrap: %v", err)
	}
}

func TestBootstrapAddsParentIDAndBuiltinOrigin(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	app, err := tests.NewTestApp(dataDir)
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	packs, err := app.FindCollectionByNameOrId("packs")
	if err != nil {
		t.Fatalf("packs collection: %v", err)
	}

	assertField(t, packs, "parent_id")

	origin, ok := packs.Fields.GetByName("origin").(*core.SelectField)
	if !ok {
		t.Fatal("origin field is not a SelectField")
	}
	assertContains(t, origin.Values, "local")
	assertContains(t, origin.Values, "remote")
	assertContains(t, origin.Values, "built-in")

	// Re-running Bootstrap against the collection created above (the
	// "existing collection" migration path) must be idempotent: the
	// parent_id field stays present exactly once and origin.Values is
	// unchanged/still correct.
	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("second Bootstrap: %v", err)
	}

	packsAgain, err := app.FindCollectionByNameOrId("packs")
	if err != nil {
		t.Fatalf("packs collection (reload): %v", err)
	}
	assertField(t, packsAgain, "parent_id")

	originAgain, ok := packsAgain.Fields.GetByName("origin").(*core.SelectField)
	if !ok {
		t.Fatal("origin field is not a SelectField after second Bootstrap")
	}
	if len(originAgain.Values) != 3 {
		t.Fatalf("origin.Values after second Bootstrap = %#v, want exactly 3 values", originAgain.Values)
	}
	assertContains(t, originAgain.Values, "local")
	assertContains(t, originAgain.Values, "remote")
	assertContains(t, originAgain.Values, "built-in")
}

func TestBootstrap_CreatesChartersAndCharterItems(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	app, err := tests.NewTestApp(dataDir)
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	charters, err := app.FindCollectionByNameOrId("charters")
	if err != nil {
		t.Fatalf("charters collection: %v", err)
	}
	charterItems, err := app.FindCollectionByNameOrId("charter_items")
	if err != nil {
		t.Fatalf("charter_items collection: %v", err)
	}

	assertField(t, charters, "name")
	assertField(t, charters, "active")
	assertField(t, charters, "created")
	assertField(t, charters, "updated")

	assertField(t, charterItems, "charter")
	assertField(t, charterItems, "pack_artifact")
	assertField(t, charterItems, "pack_name")
	assertField(t, charterItems, "artifact_type")
	assertField(t, charterItems, "artifact_id")
	assertField(t, charterItems, "artifact_name")
	assertField(t, charterItems, "enabled")
	assertField(t, charterItems, "created")
	assertField(t, charterItems, "updated")

	if !hasUniqueIndex(charterItems, "charter, artifact_type, artifact_id, pack_name") {
		t.Fatal("expected unique index on charter_items (charter, artifact_type, artifact_id, pack_name)")
	}

	charterRel := charterItems.Fields.GetByName("charter").(*core.RelationField)
	if !charterRel.CascadeDelete {
		t.Fatal("charter_items.charter must cascade delete")
	}
	packArtifactRel := charterItems.Fields.GetByName("pack_artifact").(*core.RelationField)
	if packArtifactRel.CascadeDelete {
		t.Fatal("charter_items.pack_artifact must NOT cascade delete")
	}
	if packArtifactRel.Required {
		t.Fatal("charter_items.pack_artifact must NOT be required")
	}

	// Two charters with the same name must both be saveable (no uniqueness
	// constraint on charters.name).
	c1 := core.NewRecord(charters)
	c1.Set("name", "Duplicate Name")
	if err := app.Save(c1); err != nil {
		t.Fatalf("save charter 1: %v", err)
	}
	c2 := core.NewRecord(charters)
	c2.Set("name", "Duplicate Name")
	if err := app.Save(c2); err != nil {
		t.Fatalf("save charter 2 with duplicate name: %v", err)
	}
}

func TestBootstrap_IsIdempotent(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	app, err := tests.NewTestApp(dataDir)
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("first Bootstrap: %v", err)
	}

	charters, err := app.FindCollectionByNameOrId("charters")
	if err != nil {
		t.Fatalf("charters collection: %v", err)
	}
	charterItems, err := app.FindCollectionByNameOrId("charter_items")
	if err != nil {
		t.Fatalf("charter_items collection: %v", err)
	}
	chartersID := charters.Id
	charterItemsID := charterItems.Id

	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("second Bootstrap: %v", err)
	}

	chartersAgain, err := app.FindCollectionByNameOrId("charters")
	if err != nil {
		t.Fatalf("charters collection (reload): %v", err)
	}
	charterItemsAgain, err := app.FindCollectionByNameOrId("charter_items")
	if err != nil {
		t.Fatalf("charter_items collection (reload): %v", err)
	}

	if chartersAgain.Id != chartersID {
		t.Fatalf("charters collection ID changed across Bootstrap calls: %s != %s", chartersAgain.Id, chartersID)
	}
	if charterItemsAgain.Id != charterItemsID {
		t.Fatalf("charter_items collection ID changed across Bootstrap calls: %s != %s", charterItemsAgain.Id, charterItemsID)
	}
}

func TestCharterItems_UniqueIndexAllowsCrossPackConflict(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	app, err := tests.NewTestApp(dataDir)
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	charters, err := app.FindCollectionByNameOrId("charters")
	if err != nil {
		t.Fatalf("charters collection: %v", err)
	}
	charterItems, err := app.FindCollectionByNameOrId("charter_items")
	if err != nil {
		t.Fatalf("charter_items collection: %v", err)
	}

	charter := core.NewRecord(charters)
	charter.Set("name", "Charter X")
	if err := app.Save(charter); err != nil {
		t.Fatalf("save charter: %v", err)
	}

	itemA := core.NewRecord(charterItems)
	itemA.Set("charter", charter.Id)
	itemA.Set("pack_name", "PackA")
	itemA.Set("artifact_type", "directive")
	itemA.Set("artifact_id", "DIRECTIVE_001")
	itemA.Set("artifact_name", "Directive 001")
	if err := app.Save(itemA); err != nil {
		t.Fatalf("save item A: %v", err)
	}

	itemB := core.NewRecord(charterItems)
	itemB.Set("charter", charter.Id)
	itemB.Set("pack_name", "PackB")
	itemB.Set("artifact_type", "directive")
	itemB.Set("artifact_id", "DIRECTIVE_001")
	itemB.Set("artifact_name", "Directive 001")
	if err := app.Save(itemB); err != nil {
		t.Fatalf("save item B (cross-pack conflict, must succeed): %v", err)
	}

	itemDup := core.NewRecord(charterItems)
	itemDup.Set("charter", charter.Id)
	itemDup.Set("pack_name", "PackA")
	itemDup.Set("artifact_type", "directive")
	itemDup.Set("artifact_id", "DIRECTIVE_001")
	itemDup.Set("artifact_name", "Directive 001")
	if err := app.Save(itemDup); err == nil {
		t.Fatal("expected uniqueness violation for duplicate (charter, artifact_type, artifact_id, pack_name)")
	}
}

func TestCharterItems_PackArtifactNotCascadeDeleted(t *testing.T) {
	t.Parallel()

	dataDir := t.TempDir()
	app, err := tests.NewTestApp(dataDir)
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	t.Cleanup(app.Cleanup)

	if err := collections.Bootstrap(app); err != nil {
		t.Fatalf("Bootstrap: %v", err)
	}

	packs, err := app.FindCollectionByNameOrId("packs")
	if err != nil {
		t.Fatalf("packs collection: %v", err)
	}
	artifacts, err := app.FindCollectionByNameOrId("pack_artifacts")
	if err != nil {
		t.Fatalf("pack_artifacts collection: %v", err)
	}
	charters, err := app.FindCollectionByNameOrId("charters")
	if err != nil {
		t.Fatalf("charters collection: %v", err)
	}
	charterItems, err := app.FindCollectionByNameOrId("charter_items")
	if err != nil {
		t.Fatalf("charter_items collection: %v", err)
	}

	now := types.NowDateTime()
	pack := core.NewRecord(packs)
	pack.Set("name", "demo")
	pack.Set("source_path", filepath.Join(dataDir, "demo-pack"))
	pack.Set("origin", "local")
	pack.Set("validation_status", "unknown")
	pack.Set("imported_at", now)
	pack.Set("updated_at", now)
	if err := app.Save(pack); err != nil {
		t.Fatalf("save pack: %v", err)
	}

	art := core.NewRecord(artifacts)
	art.Set("pack", pack.Id)
	art.Set("artifact_type", "directive")
	art.Set("artifact_id", "D1")
	art.Set("name", "Demo")
	art.Set("parse_ok", true)
	art.Set("source_relative_path", "demo.directive.yaml")
	if err := app.Save(art); err != nil {
		t.Fatalf("save artifact: %v", err)
	}

	charter := core.NewRecord(charters)
	charter.Set("name", "Charter Y")
	if err := app.Save(charter); err != nil {
		t.Fatalf("save charter: %v", err)
	}

	item := core.NewRecord(charterItems)
	item.Set("charter", charter.Id)
	item.Set("pack_artifact", art.Id)
	item.Set("pack_name", "demo")
	item.Set("artifact_type", "directive")
	item.Set("artifact_id", "D1")
	item.Set("artifact_name", "Demo")
	if err := app.Save(item); err != nil {
		t.Fatalf("save charter item: %v", err)
	}

	if err := app.Delete(art); err != nil {
		t.Fatalf("delete pack artifact: %v", err)
	}

	reloaded, err := app.FindRecordById(charterItems.Id, item.Id)
	if err != nil {
		t.Fatalf("expected charter_items record to survive pack_artifact deletion: %v", err)
	}
	if reloaded.GetString("pack_artifact") != "" {
		t.Fatalf("expected pack_artifact relation to be cleared, got %q", reloaded.GetString("pack_artifact"))
	}
}

func assertContains(t *testing.T, values []string, want string) {
	t.Helper()
	for _, v := range values {
		if v == want {
			return
		}
	}
	t.Fatalf("values %#v missing %q", values, want)
}

func assertField(t *testing.T, c *core.Collection, name string) {
	t.Helper()
	if c.Fields.GetByName(name) == nil {
		t.Fatalf("collection %s missing field %s", c.Name, name)
	}
}

func hasUniqueIndex(c *core.Collection, column string) bool {
	for _, idx := range c.Indexes {
		upper := strings.ToUpper(idx)
		if strings.Contains(upper, "UNIQUE") && strings.Contains(idx, column) {
			return true
		}
	}
	return false
}
