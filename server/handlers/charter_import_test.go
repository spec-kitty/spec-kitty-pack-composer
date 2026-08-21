package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// HTTP contract tests for WP07's POST /api/charters/import route.

// buildBundleZip constructs an in-memory zip mirroring WP06's
// .kittify/charter/ export layout, with the given governance.yaml doctrine
// selections and charter.md title.
func buildBundleZip(t testing.TB, charterTitle string, governanceYAML string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	write := func(name, content string) {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	write(".kittify/charter/charter.md", fmt.Sprintf("# %s\n\nSome content.\n", charterTitle))
	write(".kittify/charter/governance.yaml", governanceYAML)
	write(".kittify/charter/directives.yaml", "directives: []\n")
	write(".kittify/charter/metadata.yaml", "bundle_schema_version: 2\n")

	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	return buf.Bytes()
}

// multipartBundleRequest wraps zipBytes in a multipart/form-data body under
// the "bundle" field name (matching contracts/charters-api.yaml's
// POST /import request schema), returning the body reader and the
// Content-Type header value the request must be sent with.
func multipartBundleRequest(t testing.TB, zipBytes []byte) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	part, err := mw.CreateFormFile("bundle", "bundle.zip")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(zipBytes); err != nil {
		t.Fatalf("write bundle bytes: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	return &body, mw.FormDataContentType()
}

const sampleGovernanceYAML = "doctrine:\n" +
	"  selected_directives:\n" +
	"  - DIRECTIVE_A\n" +
	"  selected_tactics: []\n" +
	"  selected_procedures: []\n" +
	"  selected_styleguides: []\n" +
	"  selected_toolguides: []\n" +
	"  selected_agent_profiles: []\n" +
	"  selected_mission_step_contracts: []\n" +
	"  selected_templates: []\n" +
	"  selected_glossary: []\n"

func TestImportCharter_ValidBundleCreatesActiveCharter(t *testing.T) {
	var packArtifactID string

	body, contentType := multipartBundleRequest(t, buildBundleZip(t, "Imported Title", sampleGovernanceYAML))

	sc := tests.ApiScenario{
		Name:           "valid bundle import creates a new active charter",
		Method:         http.MethodPost,
		URL:            "/api/charters/import",
		Body:           body,
		Headers:        map[string]string{"Content-Type": contentType},
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"name":"Imported Title"`,
			`"active":true`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		pack := seedMinimalPack(t, app, "Pack A")
		art := seedPackArtifact(t, app, pack.Id, "directive", "DIRECTIVE_A", "Directive A")
		packArtifactID = art.Id
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var summary CharterSummary
		if err := json.NewDecoder(res.Body).Decode(&summary); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if summary.EnabledItemCount != 1 {
			t.Fatalf("enabled_item_count=%d, want 1", summary.EnabledItemCount)
		}

		items, err := app.FindRecordsByFilter("charter_items", "charter={:c}", "", 0, 0,
			map[string]any{"c": summary.ID})
		if err != nil {
			t.Fatalf("find charter_items: %v", err)
		}
		if len(items) != 1 {
			t.Fatalf("expected 1 charter_item, got %d", len(items))
		}
		item := items[0]
		if item.GetString("pack_artifact") != packArtifactID {
			t.Fatalf("pack_artifact=%q, want %q", item.GetString("pack_artifact"), packArtifactID)
		}
		if !item.GetBool("enabled") {
			t.Fatal("expected matched item to be enabled")
		}
		if countActiveCharters(t, app) != 1 {
			t.Fatalf("expected exactly 1 active charter")
		}
	}
	sc.Test(t)
}

func TestImportCharter_StructurallyInvalidCreatesNoCharter(t *testing.T) {
	body, contentType := multipartBundleRequest(t, []byte("not a zip file at all"))

	sc := tests.ApiScenario{
		Name:           "structurally invalid upload -> 400, zero charters created",
		Method:         http.MethodPost,
		URL:            "/api/charters/import",
		Body:           body,
		Headers:        map[string]string{"Content-Type": contentType},
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"invalid_bundle"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		charters, err := app.FindAllRecords("charters")
		if err != nil {
			t.Fatalf("find charters: %v", err)
		}
		if len(charters) != 0 {
			t.Fatalf("expected zero charters rows after a structurally invalid import, got %d", len(charters))
		}
	}
	sc.Test(t)
}

func TestImportCharter_MissingGovernanceYAMLCreatesNoCharter(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	w, err := zw.Create(".kittify/charter/charter.md")
	if err != nil {
		t.Fatalf("create charter.md: %v", err)
	}
	if _, err := w.Write([]byte("# Missing Governance\n")); err != nil {
		t.Fatalf("write charter.md: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}

	body, contentType := multipartBundleRequest(t, buf.Bytes())

	sc := tests.ApiScenario{
		Name:           "bundle missing governance.yaml -> 400, zero charters created",
		Method:         http.MethodPost,
		URL:            "/api/charters/import",
		Body:           body,
		Headers:        map[string]string{"Content-Type": contentType},
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"invalid_bundle"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		charters, err := app.FindAllRecords("charters")
		if err != nil {
			t.Fatalf("find charters: %v", err)
		}
		if len(charters) != 0 {
			t.Fatalf("expected zero charters rows, got %d", len(charters))
		}
	}
	sc.Test(t)
}

func TestImportCharter_UnresolvedReferenceBecomesMissingSourceItem(t *testing.T) {
	governanceYAML := "doctrine:\n" +
		"  selected_directives:\n" +
		"  - DOES_NOT_EXIST\n"

	body, contentType := multipartBundleRequest(t, buildBundleZip(t, "Missing Source Charter", governanceYAML))

	sc := tests.ApiScenario{
		Name:           "unresolved reference still imports, marked missing-source",
		Method:         http.MethodPost,
		URL:            "/api/charters/import",
		Body:           body,
		Headers:        map[string]string{"Content-Type": contentType},
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"active":true`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var summary CharterSummary
		if err := json.NewDecoder(res.Body).Decode(&summary); err != nil {
			t.Fatalf("decode: %v", err)
		}

		items, err := app.FindRecordsByFilter("charter_items", "charter={:c}", "", 0, 0,
			map[string]any{"c": summary.ID})
		if err != nil {
			t.Fatalf("find charter_items: %v", err)
		}
		if len(items) != 1 {
			t.Fatalf("expected 1 charter_item for the unresolved reference, got %d", len(items))
		}
		item := items[0]
		if item.GetString("artifact_id") != "DOES_NOT_EXIST" {
			t.Fatalf("artifact_id=%q, want DOES_NOT_EXIST", item.GetString("artifact_id"))
		}
		if !isMissingSourceItem(item) {
			t.Fatal("expected unresolved reference to be missing-source (empty pack_artifact relation)")
		}
	}
	sc.Test(t)
}

func TestImportCharter_DeactivatesPreviouslyActiveCharter(t *testing.T) {
	var previousID string

	body, contentType := multipartBundleRequest(t, buildBundleZip(t, "New Active Charter", sampleGovernanceYAML))

	sc := tests.ApiScenario{
		Name:           "import deactivates whichever charter was previously active",
		Method:         http.MethodPost,
		URL:            "/api/charters/import",
		Body:           body,
		Headers:        map[string]string{"Content-Type": contentType},
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"active":true`,
		},
		TestAppFactory: contractTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		pack := seedMinimalPack(t, app, "Pack A")
		seedPackArtifact(t, app, pack.Id, "directive", "DIRECTIVE_A", "Directive A")
		previous := seedCharter(t, app, "Previously Active", true)
		previousID = previous.Id
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		previous, err := app.FindRecordById("charters", previousID)
		if err != nil {
			t.Fatalf("reload previous: %v", err)
		}
		if previous.GetBool("active") {
			t.Fatal("expected previously active charter to be deactivated after import")
		}
		if countActiveCharters(t, app) != 1 {
			t.Fatalf("expected exactly 1 active charter after import")
		}
	}
	sc.Test(t)
}
