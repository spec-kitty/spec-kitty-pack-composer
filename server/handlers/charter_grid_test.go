package handlers

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// HTTP contract tests for WP04's GET /{charterId}/grid route
// (charters-api.yaml CharterGrid). Fixture style mirrors
// api_contract_test.go/charter_items_test.go: seedCharter,
// seedPackWithArtifact, addItemDirect.

// decodeGrid decodes an HTTP response body into the map[kind][]card shape.
func decodeGrid(t testing.TB, res *http.Response) map[string][]charterGridCardDTO {
	t.Helper()
	var out map[string][]charterGridCardDTO
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decode grid: %v", err)
	}
	return out
}

// findCard returns the first card in cards matching (artifactID, packName),
// or nil if none match.
func findCard(cards []charterGridCardDTO, artifactID, packName string) *charterGridCardDTO {
	for i := range cards {
		if cards[i].ArtifactID == artifactID && cards[i].PackName == packName {
			return &cards[i]
		}
	}
	return nil
}

func TestHTTPCharterGrid404UnknownCharter(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "grid for unknown charter → 404",
		Method:         http.MethodGet,
		URL:            "/api/charters/does-not-exist-00/grid",
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: charterItemsTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}

func TestHTTPCharterGridAllNineKindsAlwaysPresent(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "grid always has all 9 kind keys",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"glossary":[]`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		// Only 2 of the 9 kinds have any artifacts at all.
		seedPackWithArtifact(t, app, "pack1", "directive", "A", "Directive A")
		seedPackWithArtifact(t, app, "pack1", "tactic", "B", "Tactic B")
		sc.URL = "/api/charters/" + c.Id + "/grid"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		grid := decodeGrid(t, res)
		wantKinds := []string{
			"directive", "tactic", "procedure", "styleguide", "toolguide",
			"profile", "mission_step_contract", "template", "glossary",
		}
		if len(grid) != 9 {
			t.Fatalf("grid has %d keys, want 9: %v", len(grid), grid)
		}
		for _, kind := range wantKinds {
			if _, ok := grid[kind]; !ok {
				t.Fatalf("missing kind key %q in grid %v", kind, grid)
			}
		}
		if len(grid["directive"]) != 1 {
			t.Fatalf("directive cards = %v, want 1", grid["directive"])
		}
		if len(grid["tactic"]) != 1 {
			t.Fatalf("tactic cards = %v, want 1", grid["tactic"])
		}
		if len(grid["procedure"]) != 0 {
			t.Fatalf("procedure cards = %v, want empty (not omitted)", grid["procedure"])
		}
	}
	sc.Test(t)
}

func TestHTTPCharterGridInCharterEnabledCorrectness(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "grid reflects in_charter/enabled/charter_item_id per card",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"in_charter":true`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	var memberItemID string
	var memberArt, nonMemberArt *core.Record
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, memberArt = seedPackWithArtifact(t, app, "pack1", "directive", "A", "Directive A")
		_, nonMemberArt = seedPackWithArtifact(t, app, "pack1", "directive", "B", "Directive B") // never added to charter

		member := addItemDirect(t, app, c.Id, memberArt.Id)
		memberItemID = member.Id

		sc.URL = "/api/charters/" + c.Id + "/grid"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		grid := decodeGrid(t, res)
		directives := grid["directive"]
		if len(directives) != 2 {
			t.Fatalf("directive cards = %v, want 2 (both pack artifacts present)", directives)
		}

		member := findCard(directives, "A", "pack1")
		if member == nil {
			t.Fatalf("no card for member artifact A in %v", directives)
		}
		if !member.InCharter || !member.Enabled || member.CharterItemID != memberItemID {
			t.Fatalf("member card = %+v, want in_charter=true enabled=true charter_item_id=%s", member, memberItemID)
		}

		nonMember := findCard(directives, "B", "pack1")
		if nonMember == nil {
			t.Fatalf("no card for non-member artifact B in %v", directives)
		}
		if nonMember.InCharter || nonMember.Enabled || nonMember.CharterItemID != "" {
			t.Fatalf("non-member card = %+v, want in_charter=false enabled=false charter_item_id=\"\"", nonMember)
		}
		if member.PackArtifactID != memberArt.Id {
			t.Fatalf("member card = %+v, want pack_artifact_id=%s (the live pack_artifacts record id)", member, memberArt.Id)
		}
		if nonMember.PackArtifactID != nonMemberArt.Id {
			t.Fatalf("non-member card = %+v, want pack_artifact_id=%s (the live pack_artifacts record id)", nonMember, nonMemberArt.Id)
		}
	}
	sc.Test(t)
}

func TestHTTPCharterGridConflictFlagging(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "grid marks conflicting members, leaves unrelated items alone",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"conflicting":true`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)

		// 3-way conflict group: same (artifact_type, artifact_id) across
		// 3 distinct packs.
		_, art1 := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		_, art2 := seedPackWithArtifact(t, app, "pack2", "directive", "X", "Directive X")
		_, art3 := seedPackWithArtifact(t, app, "pack3", "directive", "X", "Directive X")
		addItemDirect(t, app, c.Id, art1.Id)
		addItemDirect(t, app, c.Id, art2.Id)
		addItemDirect(t, app, c.Id, art3.Id)

		// Unrelated, unconflicted item.
		_, artOther := seedPackWithArtifact(t, app, "pack1", "tactic", "Z", "Tactic Z")
		addItemDirect(t, app, c.Id, artOther.Id)

		sc.URL = "/api/charters/" + c.Id + "/grid"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		grid := decodeGrid(t, res)

		for _, pack := range []string{"pack1", "pack2", "pack3"} {
			card := findCard(grid["directive"], "X", pack)
			if card == nil {
				t.Fatalf("no card for directive/X in %s: %v", pack, grid["directive"])
			}
			if !card.Conflicting {
				t.Fatalf("card %+v should be conflicting (3-way group)", card)
			}
		}

		other := findCard(grid["tactic"], "Z", "pack1")
		if other == nil {
			t.Fatalf("no card for tactic/Z: %v", grid["tactic"])
		}
		if other.Conflicting {
			t.Fatalf("unrelated card %+v must never be conflicting", other)
		}
	}
	sc.Test(t)
}

func TestHTTPCharterGridTwoWayConflict(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "grid marks a 2-way conflict group",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"conflicting":true`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		_, art1 := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		_, art2 := seedPackWithArtifact(t, app, "pack2", "directive", "X", "Directive X")
		addItemDirect(t, app, c.Id, art1.Id)
		addItemDirect(t, app, c.Id, art2.Id)
		sc.URL = "/api/charters/" + c.Id + "/grid"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		grid := decodeGrid(t, res)
		for _, pack := range []string{"pack1", "pack2"} {
			card := findCard(grid["directive"], "X", pack)
			if card == nil || !card.Conflicting {
				t.Fatalf("card for %s = %+v, want conflicting=true", pack, card)
			}
		}
	}
	sc.Test(t)
}

func TestHTTPCharterGridMissingSourceAfterPackRemoval(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "grid flags missing-source card after its pack is removed",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"missing_source":true`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		packRec, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		addItemDirect(t, app, c.Id, art.Id)

		// Real "remove the pack, re-fetch the grid" flow: deleting the
		// pack cascades its pack_artifacts (per bootstrap.go's
		// CascadeDelete on pack_artifacts.pack), leaving the charter_items
		// row's pack_artifact relation pointing at nothing.
		if err := app.Delete(packRec); err != nil {
			t.Fatalf("delete pack: %v", err)
		}

		sc.URL = "/api/charters/" + c.Id + "/grid"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		grid := decodeGrid(t, res)
		directives := grid["directive"]
		if len(directives) != 1 {
			t.Fatalf("directive cards = %v, want exactly 1 (the missing-source card, not silently dropped)", directives)
		}
		card := directives[0]
		if !card.MissingSource {
			t.Fatalf("card %+v should be missing_source=true", card)
		}
		if !card.InCharter {
			t.Fatalf("card %+v should still be in_charter=true (denormalized data)", card)
		}
		if card.ArtifactName != "Directive X" || card.PackName != "pack1" || card.ArtifactID != "X" {
			t.Fatalf("card %+v should come from denormalized charter_items fields", card)
		}
		if card.PackArtifactID != "" {
			t.Fatalf("card %+v should have empty pack_artifact_id (no resolvable live record)", card)
		}
	}
	sc.Test(t)
}

func TestHTTPCharterGridMissingSourceExcludedFromNormalCards(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "missing-source card is not double-counted as a normal enabled/disabled card",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"missing_source":true`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		packRec, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		_, keepArt := seedPackWithArtifact(t, app, "pack2", "directive", "Y", "Directive Y")
		addItemDirect(t, app, c.Id, art.Id)
		addItemDirect(t, app, c.Id, keepArt.Id)

		if err := app.Delete(packRec); err != nil {
			t.Fatalf("delete pack: %v", err)
		}

		sc.URL = "/api/charters/" + c.Id + "/grid"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		grid := decodeGrid(t, res)
		directives := grid["directive"]
		if len(directives) != 2 {
			t.Fatalf("directive cards = %v, want exactly 2 (missing-source X + live Y)", directives)
		}
		missing := findCard(directives, "X", "pack1")
		if missing == nil || !missing.MissingSource {
			t.Fatalf("card for X = %+v, want missing_source=true", missing)
		}
		live := findCard(directives, "Y", "pack2")
		if live == nil || live.MissingSource || !live.InCharter || !live.Enabled {
			t.Fatalf("card for Y = %+v, want a normal enabled member card", live)
		}
	}
	sc.Test(t)
}

func TestHTTPCharterGridMultiplePacksGroupedByKind(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "grid includes every pack artifact across multiple packs, grouped by kind",
		Method:         http.MethodGet,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"artifact_id":"A1"`,
		},
		TestAppFactory: charterItemsTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		seedPackWithArtifact(t, app, "pack1", "directive", "A1", "Directive A1")
		seedPackWithArtifact(t, app, "pack2", "directive", "A2", "Directive A2")
		seedPackWithArtifact(t, app, "pack1", "tactic", "T1", "Tactic T1")
		seedPackWithArtifact(t, app, "pack3", "profile", "P1", "Profile P1")
		sc.URL = "/api/charters/" + c.Id + "/grid"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		grid := decodeGrid(t, res)
		if len(grid["directive"]) != 2 {
			t.Fatalf("directive cards = %v, want 2", grid["directive"])
		}
		if len(grid["tactic"]) != 1 {
			t.Fatalf("tactic cards = %v, want 1", grid["tactic"])
		}
		if len(grid["profile"]) != 1 {
			t.Fatalf("profile cards = %v, want 1", grid["profile"])
		}
		if findCard(grid["directive"], "A1", "pack1") == nil {
			t.Fatalf("missing A1/pack1 in %v", grid["directive"])
		}
		if findCard(grid["directive"], "A2", "pack2") == nil {
			t.Fatalf("missing A2/pack2 in %v", grid["directive"])
		}
	}
	sc.Test(t)
}
