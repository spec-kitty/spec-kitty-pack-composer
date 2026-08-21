package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
)

// HTTP contract tests for WP02's charter CRUD + active-invariant routes
// (charters-api.yaml + the documented GET /api/charters/summaries addition).
// Mirrors the tests.ApiScenario style established in api_contract_test.go.

func seedCharter(t testing.TB, app core.App, name string, active bool) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("charters")
	if err != nil {
		t.Fatalf("find charters collection: %v", err)
	}
	rec := core.NewRecord(col)
	rec.Set("name", name)
	rec.Set("active", active)
	if err := app.Save(rec); err != nil {
		t.Fatalf("save charter: %v", err)
	}
	return rec
}

// seedMinimalPack creates the smallest valid packs row so pack_artifacts
// rows (which require a pack relation) can be seeded independently of the
// full import/scan pipeline.
func seedMinimalPack(t testing.TB, app core.App, name string) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("packs")
	if err != nil {
		t.Fatalf("find packs collection: %v", err)
	}
	rec := core.NewRecord(col)
	rec.Set("name", name)
	rec.Set("source_path", "/tmp/"+name)
	rec.Set("origin", "local")
	now := types.NowDateTime()
	rec.Set("imported_at", now)
	rec.Set("updated_at", now)
	if err := app.Save(rec); err != nil {
		t.Fatalf("save pack: %v", err)
	}
	return rec
}

// seedPackArtifact creates a real pack_artifacts row so charter_items'
// pack_artifact relation field can reference a resolvable id (an empty
// string is used instead when a test wants a missing-source item).
func seedPackArtifact(t testing.TB, app core.App, packID, artifactType, artifactID, name string) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("pack_artifacts")
	if err != nil {
		t.Fatalf("find pack_artifacts collection: %v", err)
	}
	rec := core.NewRecord(col)
	rec.Set("pack", packID)
	rec.Set("artifact_type", artifactType)
	rec.Set("artifact_id", artifactID)
	rec.Set("name", name)
	rec.Set("source_relative_path", artifactType+"/"+artifactID+".yaml")
	if err := app.Save(rec); err != nil {
		t.Fatalf("save pack_artifact: %v", err)
	}
	return rec
}

func seedCharterItem(t testing.TB, app core.App, charterID, packArtifactID, packName, artifactType, artifactID, artifactName string, enabled bool) *core.Record {
	t.Helper()
	col, err := app.FindCollectionByNameOrId("charter_items")
	if err != nil {
		t.Fatalf("find charter_items collection: %v", err)
	}
	rec := core.NewRecord(col)
	rec.Set("charter", charterID)
	rec.Set("pack_artifact", packArtifactID)
	rec.Set("pack_name", packName)
	rec.Set("artifact_type", artifactType)
	rec.Set("artifact_id", artifactID)
	rec.Set("artifact_name", artifactName)
	rec.Set("enabled", enabled)
	if err := app.Save(rec); err != nil {
		t.Fatalf("save charter_item: %v", err)
	}
	return rec
}

func countActiveCharters(t testing.TB, app core.App) int {
	t.Helper()
	recs, err := app.FindRecordsByFilter("charters", "active=true", "", 0, 0, dbx.Params{})
	if err != nil {
		t.Fatalf("count active charters: %v", err)
	}
	if len(recs) > 1 {
		t.Fatalf("invariant violated: %d charters rows have active=true, want <= 1", len(recs))
	}
	return len(recs)
}

func TestCreateCharter_ActivatesAndDeactivatesPrevious(t *testing.T) {
	var firstID string

	createFirst := tests.ApiScenario{
		Name:           "create first charter",
		Method:         http.MethodPost,
		URL:            "/api/charters",
		Body:           strings.NewReader(`{"name":"Charter A"}`),
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"name":"Charter A"`,
			`"active":true`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
		AfterTestFunc: func(t testing.TB, app *tests.TestApp, res *http.Response) {
			var summary CharterSummary
			if err := json.NewDecoder(res.Body).Decode(&summary); err != nil {
				t.Fatalf("decode: %v", err)
			}
			firstID = summary.ID
			countActiveCharters(t, app)
		},
	}
	createFirst.Test(t)
	if firstID == "" {
		t.Fatal("expected first charter id")
	}

	createSecond := tests.ApiScenario{
		Name:           "create second charter deactivates first",
		Method:         http.MethodPost,
		URL:            "/api/charters",
		Body:           strings.NewReader(`{"name":"Charter B"}`),
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"name":"Charter B"`,
			`"active":true`,
		},
		TestAppFactory: contractTestApp,
	}
	createSecond.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		rec := seedCharter(t, app, "Charter A", true)
		firstID = rec.Id
	}
	createSecond.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		first, err := app.FindRecordById("charters", firstID)
		if err != nil {
			t.Fatalf("reload first: %v", err)
		}
		if first.GetBool("active") {
			t.Fatalf("expected first charter to be deactivated after creating a second")
		}
		if countActiveCharters(t, app) != 1 {
			t.Fatalf("expected exactly 1 active charter")
		}
	}
	createSecond.Test(t)
}

func TestCreateCharter_MissingNameReturns400(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "missing name -> 400 missing_name",
		Method:         http.MethodPost,
		URL:            "/api/charters",
		Body:           strings.NewReader(`{"name":"  "}`),
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"missing_name"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}

func TestActivateCharter_SwapsActiveFlag(t *testing.T) {
	var idA, idB string

	sc := tests.ApiScenario{
		Name:           "activate B while A active flips both",
		Method:         http.MethodPost,
		URL:            "pending",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"active":true`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		recA := seedCharter(t, app, "Charter A", true)
		recB := seedCharter(t, app, "Charter B", false)
		idA, idB = recA.Id, recB.Id
		sc.URL = "/api/charters/" + idB + "/activate"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		a, err := app.FindRecordById("charters", idA)
		if err != nil {
			t.Fatal(err)
		}
		b, err := app.FindRecordById("charters", idB)
		if err != nil {
			t.Fatal(err)
		}
		if a.GetBool("active") {
			t.Fatalf("charter A should be deactivated")
		}
		if !b.GetBool("active") {
			t.Fatalf("charter B should be active")
		}
		if countActiveCharters(t, app) != 1 {
			t.Fatalf("expected exactly 1 active charter")
		}
	}
	sc.Test(t)
}

func TestActivateCharter_AlreadyActiveIsNoop(t *testing.T) {
	var idA string

	sc := tests.ApiScenario{
		Name:           "activating an already-active charter is a no-op success",
		Method:         http.MethodPost,
		URL:            "pending",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"active":true`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		recA := seedCharter(t, app, "Charter A", true)
		idA = recA.Id
		sc.URL = "/api/charters/" + idA + "/activate"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		if countActiveCharters(t, app) != 1 {
			t.Fatalf("expected exactly 1 active charter")
		}
	}
	sc.Test(t)
}

func TestActivateCharter_UnknownIDReturns404(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "activate unknown charter -> 404",
		Method:         http.MethodPost,
		URL:            "/api/charters/does-not-exist0/activate",
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}

func TestRenameCharter_UpdatesNameOnly(t *testing.T) {
	var id string

	sc := tests.ApiScenario{
		Name:           "rename updates name, leaves active untouched",
		Method:         http.MethodPatch,
		URL:            "pending",
		Body:           strings.NewReader(`{"name":"Renamed Charter"}`),
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"name":"Renamed Charter"`,
			`"active":true`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		rec := seedCharter(t, app, "Original Name", true)
		id = rec.Id
		sc.URL = "/api/charters/" + id
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		reloaded, err := app.FindRecordById("charters", id)
		if err != nil {
			t.Fatal(err)
		}
		if reloaded.GetString("name") != "Renamed Charter" {
			t.Fatalf("name=%q want Renamed Charter", reloaded.GetString("name"))
		}
		if !reloaded.GetBool("active") {
			t.Fatalf("expected active to remain true")
		}
	}
	sc.Test(t)
}

func TestRenameCharter_EmptyNameReturns400(t *testing.T) {
	var id string

	sc := tests.ApiScenario{
		Name:           "rename with empty name -> 400",
		Method:         http.MethodPatch,
		URL:            "pending",
		Body:           strings.NewReader(`{"name":"   "}`),
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"missing_name"`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		rec := seedCharter(t, app, "Original Name", false)
		id = rec.Id
		sc.URL = "/api/charters/" + id
	}
	sc.Test(t)
}

func TestRenameCharter_UnknownIDReturns404(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "rename unknown charter -> 404",
		Method:         http.MethodPatch,
		URL:            "/api/charters/does-not-exist0",
		Body:           strings.NewReader(`{"name":"X"}`),
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}

func TestDeleteCharter_LeavesNoneActiveWhenDeletingActive(t *testing.T) {
	var id string

	sc := tests.ApiScenario{
		Name:           "deleting the active charter leaves zero active",
		Method:         http.MethodDelete,
		URL:            "pending",
		ExpectedStatus: http.StatusNoContent,
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		rec := seedCharter(t, app, "Active Charter", true)
		id = rec.Id
		sc.URL = "/api/charters/" + id
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		if countActiveCharters(t, app) != 0 {
			t.Fatalf("expected zero active charters after deleting the active one")
		}
		if _, err := app.FindRecordById("charters", id); err == nil {
			t.Fatalf("expected deleted charter to be gone")
		}
	}
	sc.Test(t)
}

func TestDeleteCharter_CascadesItems(t *testing.T) {
	var id string

	sc := tests.ApiScenario{
		Name:           "deleting a charter cascades its items",
		Method:         http.MethodDelete,
		URL:            "pending",
		ExpectedStatus: http.StatusNoContent,
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		rec := seedCharter(t, app, "Charter With Items", false)
		id = rec.Id
		seedCharterItem(t, app, id, "", "Pack A", "directive", "A", "Directive A", true)
		seedCharterItem(t, app, id, "", "Pack A", "tactic", "T", "Tactic T", false)
		sc.URL = "/api/charters/" + id
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		items, err := app.FindRecordsByFilter("charter_items", "charter={:c}", "", 0, 0, dbx.Params{"c": id})
		if err != nil {
			t.Fatal(err)
		}
		if len(items) != 0 {
			t.Fatalf("expected cascade delete of charter_items, got %d remaining", len(items))
		}
	}
	sc.Test(t)
}

func TestDeleteCharter_UnknownIDReturns404(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "delete unknown charter -> 404",
		Method:         http.MethodDelete,
		URL:            "/api/charters/does-not-exist0",
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}

func TestGetCharterSummaries_CountsAndConflicts(t *testing.T) {
	var conflictCharterID, cleanCharterID string

	sc := tests.ApiScenario{
		Name:           "summaries computes enabled_item_count and has_conflicts per charter",
		Method:         http.MethodGet,
		URL:            "/api/charters/summaries",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"enabled_item_count"`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)

		packA := seedMinimalPack(t, app, "Pack A")
		packB := seedMinimalPack(t, app, "Pack B")

		art1 := seedPackArtifact(t, app, packA.Id, "directive", "DUP", "Directive Dup")
		art2 := seedPackArtifact(t, app, packB.Id, "directive", "DUP", "Directive Dup")
		art3 := seedPackArtifact(t, app, packA.Id, "tactic", "T1", "Tactic One")
		art4 := seedPackArtifact(t, app, packA.Id, "tactic", "T2", "Tactic Two")
		art5 := seedPackArtifact(t, app, packA.Id, "procedure", "P1", "Procedure One")

		conflictCharter := seedCharter(t, app, "Conflict Charter", true)
		conflictCharterID = conflictCharter.Id
		// Conflict pair: same (artifact_type, artifact_id) from two different packs.
		seedCharterItem(t, app, conflictCharterID, art1.Id, "Pack A", "directive", "DUP", "Directive Dup", true)
		seedCharterItem(t, app, conflictCharterID, art2.Id, "Pack B", "directive", "DUP", "Directive Dup", true)
		// Non-conflicting enabled item.
		seedCharterItem(t, app, conflictCharterID, art3.Id, "Pack A", "tactic", "T1", "Tactic One", true)
		// Disabled item — should not count toward enabled_item_count.
		seedCharterItem(t, app, conflictCharterID, art4.Id, "Pack A", "tactic", "T2", "Tactic Two", false)
		// Missing-source item stored enabled=true — should not count (FR-022).
		seedCharterItem(t, app, conflictCharterID, "", "Pack A", "tactic", "T3", "Tactic Three", true)

		cleanCharter := seedCharter(t, app, "Clean Charter", false)
		cleanCharterID = cleanCharter.Id
		seedCharterItem(t, app, cleanCharterID, art5.Id, "Pack A", "procedure", "P1", "Procedure One", true)
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var summaries []CharterSummary
		if err := json.NewDecoder(res.Body).Decode(&summaries); err != nil {
			t.Fatalf("decode: %v", err)
		}
		byID := map[string]CharterSummary{}
		for _, s := range summaries {
			byID[s.ID] = s
		}

		conflictSummary, ok := byID[conflictCharterID]
		if !ok {
			t.Fatalf("missing summary for conflict charter")
		}
		if conflictSummary.EnabledItemCount != 3 {
			t.Fatalf("conflict charter enabled_item_count=%d want 3 (2 conflict-pair + 1 clean, excluding disabled and missing-source)", conflictSummary.EnabledItemCount)
		}
		if !conflictSummary.HasConflicts {
			t.Fatalf("conflict charter has_conflicts=false, want true")
		}

		cleanSummary, ok := byID[cleanCharterID]
		if !ok {
			t.Fatalf("missing summary for clean charter")
		}
		if cleanSummary.EnabledItemCount != 1 {
			t.Fatalf("clean charter enabled_item_count=%d want 1", cleanSummary.EnabledItemCount)
		}
		if cleanSummary.HasConflicts {
			t.Fatalf("clean charter has_conflicts=true, want false")
		}
	}
	sc.Test(t)
}
