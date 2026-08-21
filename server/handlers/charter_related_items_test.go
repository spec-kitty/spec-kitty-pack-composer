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

// HTTP contract tests for the directive "add related items" flow: the
// reverse-reference lookup (GET .../items/related) and the bulk-add
// endpoint (POST .../items/bulk) it feeds into.

// seedPackWithReferencingArtifact is seedPackWithArtifact plus a `content`
// blob carrying a `references: [{id, name, type, when}]` entry pointing at
// (refType, refID) — the YAML frontmatter convention read by
// findArtifactsReferencing.
func seedPackWithReferencingArtifact(
	t testing.TB, app core.App, packName, artifactType, artifactID, artifactName, refType, refID string,
) (*core.Record, *core.Record) {
	t.Helper()
	packRec, artRec := seedPackWithArtifact(t, app, packName, artifactType, artifactID, artifactName)
	artRec.Set("content", map[string]any{
		"references": []map[string]any{
			{"id": refID, "name": refID, "type": refType, "when": "test fixture"},
		},
	})
	if err := app.Save(artRec); err != nil {
		t.Fatalf("save artifact content: %v", err)
	}
	return packRec, artRec
}

func TestGetRelatedCharterItemsFindsReversedReferences(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "related items finds artifacts referencing the directive back",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"already_in_charter":false`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, directive := seedPackWithArtifact(t, app, "pack1", "directive", "DIRECTIVE_1", "Directive One")
		_, _ = seedPackWithReferencingArtifact(t, app, "pack1", "tactic", "TACTIC_1", "Tactic One", "directive", "DIRECTIVE_1")
		sc.URL = "/api/charters/" + c.Id + "/items/related?pack_artifact_id=" + directive.Id
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var result relatedItemsResultDTO
		if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if result.Target.ArtifactType != "directive" || result.Target.ArtifactID != "DIRECTIVE_1" {
			t.Fatalf("target = %+v, want the directive", result.Target)
		}
		if len(result.Related) != 1 || result.Related[0].ArtifactID != "TACTIC_1" {
			t.Fatalf("related = %+v, want exactly [TACTIC_1]", result.Related)
		}
	}
	sc.Test(t)
}

func TestGetRelatedCharterItemsMarksAlreadyInCharter(t *testing.T) {
	app, cleanup := newTestApp(t)
	defer cleanup()

	c := seedCharter(t, app, "Charter A", true)
	_, directive := seedPackWithArtifact(t, app, "pack1", "directive", "DIRECTIVE_1", "Directive One")
	_, tactic := seedPackWithReferencingArtifact(t, app, "pack1", "tactic", "TACTIC_1", "Tactic One", "directive", "DIRECTIVE_1")
	addItemDirect(t, app, c.Id, tactic.Id)

	related, err := findArtifactsReferencing(app, "directive", directive.GetString("artifact_id"))
	if err != nil {
		t.Fatal(err)
	}
	if len(related) != 1 || related[0].Id != tactic.Id {
		t.Fatalf("findArtifactsReferencing = %+v, want exactly [tactic]", related)
	}

	packName, err := packNameForArtifact(app, tactic)
	if err != nil {
		t.Fatal(err)
	}
	existing, err := findCharterItemByIdentity(app, c.Id, "tactic", "TACTIC_1", packName)
	if err != nil {
		t.Fatal(err)
	}
	if existing == nil {
		t.Fatal("expected the tactic to already be in the charter")
	}
}

func TestGetRelatedCharterItemsEmptyForNonDirective(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "non-directive target returns an empty related list",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"related":[]`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, tactic := seedPackWithArtifact(t, app, "pack1", "tactic", "TACTIC_1", "Tactic One")
		sc.URL = "/api/charters/" + c.Id + "/items/related?pack_artifact_id=" + tactic.Id
	}
	sc.Test(t)
}

func TestGetRelatedCharterItemsEmptyWhenNoReferencers(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "directive with nothing referencing it returns an empty related list",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"related":[]`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, directive := seedPackWithArtifact(t, app, "pack1", "directive", "DIRECTIVE_1", "Directive One")
		sc.URL = "/api/charters/" + c.Id + "/items/related?pack_artifact_id=" + directive.Id
	}
	sc.Test(t)
}

func TestHTTPAddCharterItemsBulkInsertsAll(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "bulk add inserts the directive plus its related items",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"added_count":2`,
			`"already_present_count":0`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, directive := seedPackWithArtifact(t, app, "pack1", "directive", "DIRECTIVE_1", "Directive One")
		_, tactic := seedPackWithReferencingArtifact(t, app, "pack1", "tactic", "TACTIC_1", "Tactic One", "directive", "DIRECTIVE_1")
		sc.URL = "/api/charters/" + c.Id + "/items/bulk"
		sc.Body = strings.NewReader(fmt.Sprintf(`{"pack_artifact_ids":[%q,%q]}`, directive.Id, tactic.Id))
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var result bulkAddResultDTO
		if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(result.Items) != 2 {
			t.Fatalf("items = %+v, want 2 entries", result.Items)
		}
	}
	sc.Test(t)
}

func TestHTTPAddCharterItemsBulkIsIdempotentPerItem(t *testing.T) {
	app, cleanup := newTestApp(t)
	defer cleanup()

	c := seedCharter(t, app, "Charter A", true)
	_, directive := seedPackWithArtifact(t, app, "pack1", "directive", "DIRECTIVE_1", "Directive One")
	_, tactic := seedPackWithReferencingArtifact(t, app, "pack1", "tactic", "TACTIC_1", "Tactic One", "directive", "DIRECTIVE_1")

	// Pre-add the directive alone, so the bulk call below should report it
	// as already-present and only the tactic as newly added.
	addItemDirect(t, app, c.Id, directive.Id)

	recs, addedCount, alreadyPresentCount := bulkAddDirect(t, app, c.Id, []string{directive.Id, tactic.Id})
	if len(recs) != 2 {
		t.Fatalf("expected 2 records, got %d", len(recs))
	}
	if addedCount != 1 || alreadyPresentCount != 1 {
		t.Fatalf("added=%d already_present=%d, want 1/1", addedCount, alreadyPresentCount)
	}

	all, err := app.FindRecordsByFilter("charter_items", "charter={:c}", "", 0, 0, dbx.Params{"c": c.Id})
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("expected exactly 2 charter_items rows total, got %d", len(all))
	}
}

func TestHTTPAddCharterItemsBulkResolvesConflictsWithinBatch(t *testing.T) {
	app, cleanup := newTestApp(t)
	defer cleanup()

	c := seedCharter(t, app, "Charter A", true)
	_, artA := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
	_, artB := seedPackWithArtifact(t, app, "pack2", "directive", "X", "Directive X")

	recs, addedCount, _ := bulkAddDirect(t, app, c.Id, []string{artA.Id, artB.Id})
	if addedCount != 2 {
		t.Fatalf("added_count = %d, want 2", addedCount)
	}
	if !recs[0].GetBool("enabled") {
		t.Fatal("first item in the batch should be enabled")
	}
	if recs[1].GetBool("enabled") {
		t.Fatal("second item colliding on identity within the same batch should be disabled")
	}
	if got := countEnabledInIdentity(t, app, c.Id, "directive", "X"); got != 1 {
		t.Fatalf("at most one member of the conflict group should be enabled, got %d", got)
	}
}

// bulkAddDirect exercises addCharterItemsBulk's underlying per-item logic
// (addOrGetCharterItem in a loop) directly, mirroring addItemDirect's
// rationale for tests that need repeated/inspectable calls against the same
// in-process app.
func bulkAddDirect(t testing.TB, app core.App, charterID string, packArtifactIDs []string) (recs []*core.Record, addedCount, alreadyPresentCount int) {
	t.Helper()
	for _, id := range packArtifactIDs {
		rec, created, err := addOrGetCharterItem(app, charterID, id)
		if err != nil {
			t.Fatalf("addOrGetCharterItem(%s): %v", id, err)
		}
		recs = append(recs, rec)
		if created {
			addedCount++
		} else {
			alreadyPresentCount++
		}
	}
	return recs, addedCount, alreadyPresentCount
}

func TestHTTPAddCharterItemsBulkRejectsEmptyList(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "bulk add with no ids → 400",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"missing_pack_artifact_ids"`,
		},
		TestAppFactory: charterItemsTestApp,
		Body:           strings.NewReader(`{"pack_artifact_ids":[]}`),
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		sc.URL = "/api/charters/" + c.Id + "/items/bulk"
	}
	sc.Test(t)
}

func TestHTTPAddCharterItemsBulkUnknownCharter404(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "bulk add unknown charter → 404",
		Method:         http.MethodPost,
		URL:            "/api/charters/does-not-exist-00/items/bulk",
		Body:           strings.NewReader(`{"pack_artifact_ids":["does-not-exist-00"]}`),
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: charterItemsTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}
