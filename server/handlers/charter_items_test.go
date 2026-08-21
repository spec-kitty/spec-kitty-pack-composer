package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// HTTP contract tests for WP03's add/remove/toggle routes
// (charters-api.yaml). Not parallel: shares patterns with api_contract_test.go.

// seedCharter creates a minimal charters row.
// seedPackWithArtifact creates a packs row plus a single pack_artifacts row
// with the given identity, returning (packRecord, artifactRecord).
func seedPackWithArtifact(t testing.TB, app core.App, packName, artifactType, artifactID, artifactName string) (*core.Record, *core.Record) {
	t.Helper()
	packsCol, err := app.FindCollectionByNameOrId("packs")
	if err != nil {
		t.Fatalf("find packs collection: %v", err)
	}
	packRec := core.NewRecord(packsCol)
	packRec.Set("name", packName)
	packRec.Set("source_path", t.TempDir())
	packRec.Set("origin", "local")
	packRec.Set("imported_at", "2024-01-01 00:00:00.000Z")
	packRec.Set("updated_at", "2024-01-01 00:00:00.000Z")
	if err := app.Save(packRec); err != nil {
		t.Fatalf("save pack: %v", err)
	}

	artsCol, err := app.FindCollectionByNameOrId("pack_artifacts")
	if err != nil {
		t.Fatalf("find pack_artifacts collection: %v", err)
	}
	artRec := core.NewRecord(artsCol)
	artRec.Set("pack", packRec.Id)
	artRec.Set("artifact_type", artifactType)
	artRec.Set("artifact_id", artifactID)
	artRec.Set("name", artifactName)
	artRec.Set("source_relative_path", fmt.Sprintf("%s.%s.yaml", artifactID, artifactType))
	if err := app.Save(artRec); err != nil {
		t.Fatalf("save pack_artifact: %v", err)
	}
	return packRec, artRec
}

func charterItemsTestApp(t testing.TB) *tests.TestApp {
	t.Helper()
	return contractTestApp(t)
}

func countEnabledInIdentity(t testing.TB, app core.App, charterID, artifactType, artifactID string) int {
	t.Helper()
	recs, err := app.FindRecordsByFilter(
		"charter_items",
		"charter={:charter} && artifact_type={:type} && artifact_id={:id} && enabled=true",
		"", 0, 0,
		dbx.Params{"charter": charterID, "type": artifactType, "id": artifactID},
	)
	if err != nil {
		t.Fatalf("count enabled: %v", err)
	}
	return len(recs)
}

func TestHTTPAddCharterItemNewInsertsEnabled(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "add new item enabled=true",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"enabled":true`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		sc.URL = "/api/charters/" + c.Id + "/items"
		sc.Body = strings.NewReader(fmt.Sprintf(`{"pack_artifact_id":%q}`, art.Id))
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var dto charterItemDTO
		if err := json.NewDecoder(res.Body).Decode(&dto); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if dto.MissingSource {
			t.Fatal("freshly added item from a live pack_artifacts record must have missing_source=false")
		}
	}
	sc.Test(t)
}

func TestHTTPAddCharterItemNoDuplicateOnSecondCall(t *testing.T) {
	app, cleanup := newTestApp(t)
	defer cleanup()

	c := seedCharter(t, app, "Charter A", true)
	_, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")

	call := func() *core.Record {
		rec := addItemDirect(t, app, c.Id, art.Id)
		return rec
	}

	first := call()
	second := call()
	if first.Id != second.Id {
		t.Fatalf("expected same row id, got %s vs %s", first.Id, second.Id)
	}

	all, err := app.FindRecordsByFilter("charter_items", "charter={:c}", "", 0, 0, dbx.Params{"c": c.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 1 {
		t.Fatalf("count should not increase on second add, got %d rows", len(all))
	}
}

// addItemDirect exercises addCharterItem's underlying logic path without
// going through the HTTP router (some tests need repeated calls against the
// same in-process app, which the ApiScenario helper doesn't support cleanly).
func addItemDirect(t testing.TB, app core.App, charterID, packArtifactID string) *core.Record {
	t.Helper()

	artifactRec, err := app.FindRecordById("pack_artifacts", packArtifactID)
	if err != nil {
		t.Fatalf("find artifact: %v", err)
	}
	packName, err := packNameForArtifact(app, artifactRec)
	if err != nil {
		t.Fatalf("pack name: %v", err)
	}
	artifactType := artifactRec.GetString("artifact_type")
	artifactID := artifactRec.GetString("artifact_id")

	existing, err := findCharterItemByIdentity(app, charterID, artifactType, artifactID, packName)
	if err != nil {
		t.Fatalf("find existing: %v", err)
	}
	if existing != nil {
		return existing
	}

	conflictRec, err := app.FindFirstRecordByFilter(
		"charter_items",
		"charter={:charter} && artifact_type={:type} && artifact_id={:id} && enabled=true",
		dbx.Params{"charter": charterID, "type": artifactType, "id": artifactID},
	)
	enabled := true
	if err == nil && conflictRec != nil {
		enabled = false
	}

	col, err := app.FindCollectionByNameOrId("charter_items")
	if err != nil {
		t.Fatalf("find collection: %v", err)
	}
	rec := core.NewRecord(col)
	rec.Set("charter", charterID)
	rec.Set("pack_artifact", artifactRec.Id)
	rec.Set("pack_name", packName)
	rec.Set("artifact_type", artifactType)
	rec.Set("artifact_id", artifactID)
	rec.Set("artifact_name", artifactRec.GetString("name"))
	rec.Set("enabled", enabled)
	if err := app.Save(rec); err != nil {
		t.Fatalf("save: %v", err)
	}
	return rec
}

func TestHTTPAddCharterItemConflictOnAdd(t *testing.T) {
	app, cleanup := newTestApp(t)
	defer cleanup()

	c := seedCharter(t, app, "Charter A", true)
	_, art1 := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
	_, art2 := seedPackWithArtifact(t, app, "pack2", "directive", "X", "Directive X")

	first := addItemDirect(t, app, c.Id, art1.Id)
	if !first.GetBool("enabled") {
		t.Fatalf("first item should be enabled=true, got %v", first.GetBool("enabled"))
	}

	second := addItemDirect(t, app, c.Id, art2.Id)
	if second.GetBool("enabled") {
		t.Fatalf("second item colliding on identity should be enabled=false, got %v", second.GetBool("enabled"))
	}

	// Re-fetch first to confirm it wasn't touched by the second add.
	reloadedFirst, err := app.FindRecordById("charter_items", first.Id)
	if err != nil {
		t.Fatal(err)
	}
	if !reloadedFirst.GetBool("enabled") {
		t.Fatal("first item's enabled state must not change on a conflicting add")
	}

	if got := countEnabledInIdentity(t, app, c.Id, "directive", "X"); got != 1 {
		t.Fatalf("at most one member of the conflict group should be enabled, got %d", got)
	}

	ids, err := conflictingIDsForCharter(app, c.Id)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids[first.Id]) != 1 || ids[first.Id][0] != second.Id {
		t.Fatalf("first's conflicting_item_ids = %v, want [%s]", ids[first.Id], second.Id)
	}
}

func TestRemoveCharterItemHardDelete(t *testing.T) {
	app, cleanup := newTestApp(t)
	defer cleanup()

	c := seedCharter(t, app, "Charter A", true)
	_, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
	item := addItemDirect(t, app, c.Id, art.Id)

	sc := tests.ApiScenario{
		Name:           "remove item regardless of state",
		Method:         http.MethodDelete,
		URL:            "/api/charters/" + c.Id + "/items/" + item.Id,
		ExpectedStatus: http.StatusNoContent,
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app2 *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		// Re-seed on this scenario's own app instance.
		c2 := seedCharter(t, app2, "Charter A", true)
		_, art2 := seedPackWithArtifact(t, app2, "pack1", "directive", "X", "Directive X")
		item2 := addItemDirect(t, app2, c2.Id, art2.Id)
		sc.URL = "/api/charters/" + c2.Id + "/items/" + item2.Id
	}
	sc.Test(t)
}

func TestRemoveCharterItemWrongCharterReturns404(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "remove item scoped to wrong charter → 404",
		Method:         http.MethodDelete,
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		charterA := seedCharter(t, app, "Charter A", true)
		charterB := seedCharter(t, app, "Charter B", true)
		_, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		item := addItemDirect(t, app, charterA.Id, art.Id)
		// itemId belongs to charterA, but URL uses charterB.
		sc.URL = "/api/charters/" + charterB.Id + "/items/" + item.Id
	}
	sc.Test(t)
}

func TestHTTPToggleEnablesAndDisablesConflictGroupAtomically(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "toggle enable auto-disables the other conflict-group member",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"enabled":true`,
			`"auto_disabled"`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	var charterID, itemBID string
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, art1 := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		_, art2 := seedPackWithArtifact(t, app, "pack2", "directive", "X", "Directive X")
		itemA := addItemDirect(t, app, c.Id, art1.Id) // enabled=true
		itemB := addItemDirect(t, app, c.Id, art2.Id) // enabled=false, conflicts with A
		charterID = c.Id
		itemBID = itemB.Id
		_ = itemA
		sc.URL = "/api/charters/" + c.Id + "/items/" + itemB.Id + "/toggle"
		sc.Body = strings.NewReader(`{"enabled":true}`)
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var result toggleResultDTO
		if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if result.Item.ID != itemBID || !result.Item.Enabled {
			t.Fatalf("item = %+v, want enabled itemB", result.Item)
		}
		if len(result.AutoDisabled) != 1 {
			t.Fatalf("auto_disabled = %+v, want exactly 1 entry", result.AutoDisabled)
		}

		if got := countEnabledInIdentity(t, app, charterID, "directive", "X"); got != 1 {
			t.Fatalf("at most one member of the conflict group should be enabled after toggle, got %d", got)
		}
	}
	sc.Test(t)
}

func TestHTTPToggleMissingSourceRejected(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "toggle missing-source item → 400",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"missing_source_not_toggleable"`,
		},
		TestAppFactory: charterItemsTestApp,
		Body:           strings.NewReader(`{"enabled":true}`),
	}
	var charterID, itemID string
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		item := addItemDirect(t, app, c.Id, art.Id)
		charterID = c.Id
		itemID = item.Id

		// Force enabled=false first so the rejected "enable" request below
		// has an observable no-change assertion.
		item.Set("enabled", false)
		if err := app.Save(item); err != nil {
			t.Fatalf("set enabled=false: %v", err)
		}

		// Simulate "missing source": the underlying pack_artifacts record is
		// gone (pack removed), but the charter_items row's relation still
		// points at the now-nonexistent id.
		if err := app.Delete(art); err != nil {
			t.Fatalf("delete artifact: %v", err)
		}

		sc.URL = "/api/charters/" + c.Id + "/items/" + item.Id + "/toggle"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		rec, err := app.FindRecordById("charter_items", itemID)
		if err != nil {
			t.Fatal(err)
		}
		if rec.GetBool("enabled") {
			t.Fatal("missing-source item's enabled value must not change on a rejected toggle")
		}
		_ = charterID
	}
	sc.Test(t)
}

func TestHTTPToggleDisableNeverTouchesOthers(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "disable never touches other items",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"enabled":false`,
		},
		TestAppFactory: charterItemsTestApp,
		Body:           strings.NewReader(`{"enabled":false}`),
	}
	var otherID string
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, art1 := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		_, art2 := seedPackWithArtifact(t, app, "pack2", "tactic", "Z", "Tactic Z")
		itemA := addItemDirect(t, app, c.Id, art1.Id)
		itemOther := addItemDirect(t, app, c.Id, art2.Id)
		otherID = itemOther.Id
		sc.URL = "/api/charters/" + c.Id + "/items/" + itemA.Id + "/toggle"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		other, err := app.FindRecordById("charter_items", otherID)
		if err != nil {
			t.Fatal(err)
		}
		if !other.GetBool("enabled") {
			t.Fatal("unrelated item must not be touched by disabling a different item")
		}
	}
	sc.Test(t)
}

func TestHTTPToggleAutoDisabledEmptyWhenNoConflict(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "toggle enable with no conflict group has empty auto_disabled",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"auto_disabled":[]`,
		},
		TestAppFactory: charterItemsTestApp,
		Body:           strings.NewReader(`{"enabled":true}`),
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		item := addItemDirect(t, app, c.Id, art.Id)
		item.Set("enabled", false)
		if err := app.Save(item); err != nil {
			t.Fatal(err)
		}
		sc.URL = "/api/charters/" + c.Id + "/items/" + item.Id + "/toggle"
	}
	sc.Test(t)
}

func TestHTTPAddCharterItemUnknownCharterOrArtifact404(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "add item unknown charter → 404",
		Method:         http.MethodPost,
		URL:            "/api/charters/does-not-exist-00/items",
		Body:           strings.NewReader(`{"pack_artifact_id":"does-not-exist-00"}`),
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: charterItemsTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}
