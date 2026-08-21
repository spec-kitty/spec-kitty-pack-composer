package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/spec-kitty/pack-composer/server/pack/builtin"
)

// HTTP contract tests for the WP06 read-only routes (pack-inheritance-api.yaml).

func TestHTTPParentStatusMissingRef(t *testing.T) {
	stubCLIMissing(t)
	root := writeSamplePack(t, "1.0.0")

	var packBID string
	sc := tests.ApiScenario{
		Name:           "parent-status reports missing with broken_ref",
		Method:         http.MethodGet,
		URL:            "/api/packs/parent-status",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"status":"missing"`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		rec := seedPack(t, app, root, "local")
		rec.Set("project_key", "pack-b")
		rec.Set("parent_id", "does-not-exist")
		if err := app.Save(rec); err != nil {
			t.Fatalf("set parent_id: %v", err)
		}
		packBID = rec.Id
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var out map[string]parentStatusDTO
		if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		got, ok := out[packBID]
		if !ok {
			t.Fatalf("missing entry for pack %s in %+v", packBID, out)
		}
		if got.Status != "missing" || got.BrokenRef != "does-not-exist" {
			t.Fatalf("pack %s status=%+v", packBID, got)
		}
	}
	sc.Test(t)
}

func TestHTTPParentStatusResolvedFallback(t *testing.T) {
	stubCLIMissing(t)
	root := writeSamplePack(t, "1.0.0")

	var packID string
	sc := tests.ApiScenario{
		Name:           "parent-status resolves via built-in fallback when no extends declared",
		Method:         http.MethodGet,
		URL:            "/api/packs/parent-status",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"status":"resolved"`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		if err := builtin.Bootstrap(app); err != nil {
			t.Fatalf("builtin.Bootstrap: %v", err)
		}
		rec := seedPack(t, app, root, "local")
		packID = rec.Id
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var out map[string]parentStatusDTO
		if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		got, ok := out[packID]
		if !ok {
			t.Fatalf("missing entry for pack %s in %+v", packID, out)
		}
		if got.Status != "resolved" || got.BrokenRef != "" {
			t.Fatalf("pack %s status=%+v", packID, got)
		}
	}
	sc.Test(t)
}

func TestHTTPPackResolved404(t *testing.T) {
	stubCLIMissing(t)

	sc := tests.ApiScenario{
		Name:           "GET /{packId}/resolved 404 for unknown id",
		Method:         http.MethodGet,
		URL:            "/api/packs/does-not-exist-00/resolved",
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}

func TestHTTPPackResolvedOwnArtifactWins(t *testing.T) {
	stubCLIMissing(t)
	parentRoot := writeSamplePack(t, "1.0.0")
	childRoot := writeSamplePack(t, "1.0.0")

	var childID string
	sc := tests.ApiScenario{
		Name:           "own artifact shadows an inherited artifact with the same (type,id)",
		Method:         http.MethodGet,
		URL:            "/api/packs/pending/resolved",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"status":"resolved"`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		if err := builtin.Bootstrap(app); err != nil {
			t.Fatalf("builtin.Bootstrap: %v", err)
		}

		parentRec := seedPack(t, app, parentRoot, "local")
		parentRec.Set("project_key", "parent-key")
		if err := app.Save(parentRec); err != nil {
			t.Fatalf("set parent project_key: %v", err)
		}

		childRec := seedPack(t, app, childRoot, "local")
		childRec.Set("parent_id", "parent-key")
		if err := app.Save(childRec); err != nil {
			t.Fatalf("set child parent_id: %v", err)
		}
		childID = childRec.Id
		sc.URL = "/api/packs/" + childID + "/resolved"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var out resolvedPackDTO
		if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if out.PackID != childID {
			t.Fatalf("pack_id=%s want %s", out.PackID, childID)
		}
		matches := 0
		for _, a := range out.Artifacts {
			if a.ArtifactType == "directive" && a.ArtifactID == "A" {
				matches++
				if a.Origin != "own" {
					t.Fatalf("expected origin=own, got %+v", a)
				}
			}
		}
		if matches != 1 {
			t.Fatalf("expected exactly one directive/A entry, got %d in %+v", matches, out.Artifacts)
		}
	}
	sc.Test(t)
}

func TestHTTPBuiltinPackParentStatusAndResolved(t *testing.T) {
	stubCLIMissing(t)

	var builtinID string
	statusSC := tests.ApiScenario{
		Name:           "built-in pack is always resolved with no broken_ref key",
		Method:         http.MethodGet,
		URL:            "/api/packs/parent-status",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"status":"resolved"`,
		},
		TestAppFactory: contractTestApp,
	}
	statusSC.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		if err := builtin.Bootstrap(app); err != nil {
			t.Fatalf("builtin.Bootstrap: %v", err)
		}
		recs, err := app.FindAllRecords("packs")
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range recs {
			if r.GetString("origin") == "built-in" {
				builtinID = r.Id
			}
		}
		if builtinID == "" {
			t.Fatal("expected built-in pack record to exist")
		}
	}
	statusSC.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		body, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatal(err)
		}
		var out map[string]json.RawMessage
		if err := json.Unmarshal(body, &out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		raw, ok := out[builtinID]
		if !ok {
			t.Fatalf("missing built-in entry in %s", body)
		}
		var dto parentStatusDTO
		if err := json.Unmarshal(raw, &dto); err != nil {
			t.Fatal(err)
		}
		if dto.Status != "resolved" {
			t.Fatalf("built-in status=%+v", dto)
		}
		if strings.Contains(string(raw), "broken_ref") {
			t.Fatalf("expected broken_ref to be omitted for built-in, got %s", raw)
		}
	}
	statusSC.Test(t)

	resolvedSC := tests.ApiScenario{
		Name:           "built-in pack /resolved only contains own-origin artifacts",
		Method:         http.MethodGet,
		URL:            "/api/packs/pending/resolved",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"status":"resolved"`,
		},
		TestAppFactory: contractTestApp,
	}
	resolvedSC.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		if err := builtin.Bootstrap(app); err != nil {
			t.Fatalf("builtin.Bootstrap: %v", err)
		}
		recs, err := app.FindAllRecords("packs")
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range recs {
			if r.GetString("origin") == "built-in" {
				builtinID = r.Id
			}
		}
		resolvedSC.URL = "/api/packs/" + builtinID + "/resolved"
	}
	resolvedSC.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var out resolvedPackDTO
		if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if out.PackID != builtinID {
			t.Fatalf("pack_id=%s want %s", out.PackID, builtinID)
		}
		for _, a := range out.Artifacts {
			if a.Origin != "own" {
				t.Fatalf("built-in pack should never inherit, got origin=%s in %+v", a.Origin, a)
			}
		}
	}
	resolvedSC.Test(t)
}
