package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/spec-kitty/pack-composer/server/cli"
	"github.com/spec-kitty/pack-composer/server/collections"
	"github.com/spec-kitty/pack-composer/server/pack/builtin"
)

// HTTP contract smoke tests against handlers.Register (packs-api.yaml).
// Not parallel: stubs global cli lookPath/commandFactory and defaultPackLocks.

func TestHTTPImportPackSummaryAndUpsert(t *testing.T) {
	stubCLIMissing(t)
	root := writeSamplePack(t, "1.0.0")

	var seededID string
	importNew := tests.ApiScenario{
		Name:           "import returns PackSummary origin=local",
		Method:         http.MethodPost,
		URL:            "/api/packs/import",
		Body:           strings.NewReader(fmt.Sprintf(`{"source_path":%q}`, root)),
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"origin":"local"`,
			`"name":"Sample Pack"`,
			`"version":"1.0.0"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
		AfterTestFunc: func(t testing.TB, app *tests.TestApp, res *http.Response) {
			var summary PackSummary
			if err := json.NewDecoder(res.Body).Decode(&summary); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if summary.ID == "" || summary.Origin != "local" {
				t.Fatalf("summary=%+v", summary)
			}
			seededID = summary.ID
		},
	}
	importNew.Test(t)
	if seededID == "" {
		t.Fatal("expected imported id")
	}

	mustWrite(t, filepath.Join(root, ".pack-version"), "1.1.0\n")
	upsert := tests.ApiScenario{
		Name:           "import same source_path upserts",
		Method:         http.MethodPost,
		URL:            "/api/packs/import",
		Body:           strings.NewReader(fmt.Sprintf(`{"source_path":%q}`, root)),
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"origin":"local"`,
			`"version":"1.1.0"`,
		},
		TestAppFactory: contractTestApp,
	}
	upsert.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		// Pre-seed so import hits upsert path on a fresh app/router.
		sp, err := loadPackFromDisk(root, false)
		if err != nil {
			t.Fatal(err)
		}
		// Reset version file was already updated to 1.1.0; seed with prior parse of disk.
		rec, err := persistScannedPack(app, nil, sp, historySourceImport)
		if err != nil {
			t.Fatal(err)
		}
		seededID = rec.Id
	}
	upsert.ExpectedContent = []string{
		`"origin":"local"`,
		`"version":"1.1.0"`,
	}
	upsert.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var summary PackSummary
		if err := json.NewDecoder(res.Body).Decode(&summary); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if summary.ID != seededID {
			t.Fatalf("upsert id=%s want %s", summary.ID, seededID)
		}
		packs, err := app.FindAllRecords("packs")
		if err != nil {
			t.Fatal(err)
		}
		if len(packs) != 1 {
			t.Fatalf("want 1 pack after upsert, got %d", len(packs))
		}
	}
	upsert.Test(t)
}

func TestHTTPImportZeroArtifacts(t *testing.T) {
	stubCLIMissing(t)
	empty := t.TempDir()

	sc := tests.ApiScenario{
		Name:           "import zero artifacts → 400 no_artifacts",
		Method:         http.MethodPost,
		URL:            "/api/packs/import",
		Body:           strings.NewReader(fmt.Sprintf(`{"source_path":%q}`, empty)),
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"no_artifacts"`,
			`"message":`,
		},
		NotExpectedContent: []string{
			`"validation_invalid_value"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}

func TestHTTPRefreshOK404400(t *testing.T) {
	stubCLIMissing(t)
	root := writeSamplePack(t, "1.0.0")

	var packID string
	refresh200 := tests.ApiScenario{
		Name:           "refresh 200",
		Method:         http.MethodPost,
		URL:            "/api/packs/pending/refresh",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"origin":"local"`,
		},
		TestAppFactory: contractTestApp,
	}
	refresh200.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		r := seedPack(t, app, root, "local")
		packID = r.Id
		refresh200.URL = "/api/packs/" + r.Id + "/refresh"
	}
	refresh200.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		var summary PackSummary
		if err := json.NewDecoder(res.Body).Decode(&summary); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if summary.ID != packID {
			t.Fatalf("id=%s want %s", summary.ID, packID)
		}
	}
	refresh200.Test(t)

	notFound := tests.ApiScenario{
		Name:           "refresh 404",
		Method:         http.MethodPost,
		URL:            "/api/packs/missingpack00/refresh",
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: contractTestApp,
		BeforeTestFunc: registerRoutes,
	}
	notFound.Test(t)

	goneRoot := writeSamplePack(t, "1.0.0")
	refresh400 := tests.ApiScenario{
		Name:           "refresh 400 path unreadable",
		Method:         http.MethodPost,
		URL:            "/api/packs/pending/refresh",
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"path_unreadable"`,
		},
		TestAppFactory: contractTestApp,
	}
	refresh400.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		r := seedPack(t, app, goneRoot, "local")
		if err := os.RemoveAll(goneRoot); err != nil {
			t.Fatal(err)
		}
		refresh400.URL = "/api/packs/" + r.Id + "/refresh"
	}
	refresh400.Test(t)
}

// Regression: refreshing the built-in pack must not fall through to the
// generic loadPackFromDisk path, which treats source_path (the installed
// spec-kitty doctrine directory, or the "<builtin>" fallback when it can't
// be resolved) as a pack root to blindly re-scan and validate. Before the
// fix, this either 400'd (fallback path doesn't exist on disk) or produced
// spurious validation errors from scanning content spec-kitty never
// structured as a pack. It must instead re-run builtin.Bootstrap.
func TestHTTPRefreshBuiltinPackUsesBootstrapNotDiskScan(t *testing.T) {
	restoreCLILook := cli.StubLookPath(func(string) (string, error) {
		return "", errors.New("not found")
	})
	t.Cleanup(restoreCLILook)
	restoreBuiltinLook := builtin.StubLookPathFn(func(string) (string, error) {
		return "", errors.New("not found")
	})
	t.Cleanup(restoreBuiltinLook)

	var packID string
	refreshBuiltin := tests.ApiScenario{
		Name:           "refresh built-in pack",
		Method:         http.MethodPost,
		URL:            "/api/packs/pending/refresh",
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			`"origin":"built-in"`,
		},
		TestAppFactory: contractTestApp,
	}
	refreshBuiltin.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		if err := builtin.Bootstrap(app); err != nil {
			t.Fatalf("builtin.Bootstrap: %v", err)
		}
		rec, err := app.FindFirstRecordByFilter("packs", "project_key = {:pk}",
			dbx.Params{"pk": builtin.ProjectKey})
		if err != nil {
			t.Fatalf("find built-in pack: %v", err)
		}
		packID = rec.Id
		refreshBuiltin.URL = "/api/packs/" + packID + "/refresh"
	}
	refreshBuiltin.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		rec, err := app.FindRecordById("packs", packID)
		if err != nil {
			t.Fatalf("reload built-in pack: %v", err)
		}
		if got := rec.GetString("validation_status"); got == "errors" {
			t.Fatalf("built-in pack refresh produced validation_status=errors, want no spurious errors from disk-scanning the doctrine directory")
		}
	}
	refreshBuiltin.Test(t)
}

func TestHTTPExportZIPHeadersAndCLIMissing(t *testing.T) {
	root := writeSamplePack(t, "2.0.0")

	t.Run("zip with validation errors", func(t *testing.T) {
		restoreLook := cli.StubLookPath(func(string) (string, error) { return "/bin/true", nil })
		t.Cleanup(restoreLook)

		script := filepath.Join(t.TempDir(), "validate.sh")
		mustWrite(t, script, "#!/bin/sh\necho '{\"ok\":false,\"errors\":[\"bad\"]}'\nexit 1\n")
		_ = os.Chmod(script, 0o755)
		restoreCmd := cli.StubCommandFactory(func(name string, args ...string) *exec.Cmd {
			return exec.Command(script)
		})
		t.Cleanup(restoreCmd)

		scenario := tests.ApiScenario{
			Name:            "export zip even with validation errors",
			Method:          http.MethodPost,
			URL:             "/api/packs/pending/export",
			ExpectedStatus:  http.StatusOK,
			ExpectedContent: []string{"PK"}, // ZIP local-file header magic
			TestAppFactory:  contractTestApp,
		}
		scenario.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			Register(e)
			r := seedPack(t, app, root, "local")
			scenario.URL = "/api/packs/" + r.Id + "/export"
		}
		scenario.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
			ct := res.Header.Get("Content-Type")
			if !strings.Contains(ct, "application/zip") {
				t.Fatalf("Content-Type=%q", ct)
			}
			if got := res.Header.Get("X-Pack-Validation-Status"); got != "errors" {
				t.Fatalf("X-Pack-Validation-Status=%q", got)
			}
			errs := res.Header.Get("X-Pack-Validation-Errors")
			if !strings.Contains(errs, "bad") {
				t.Fatalf("X-Pack-Validation-Errors=%q", errs)
			}
		}
		scenario.Test(t)
	})

	t.Run("503 cli missing", func(t *testing.T) {
		stubCLIMissing(t)

		scenario := tests.ApiScenario{
			Name:           "export 503 cli_missing",
			Method:         http.MethodPost,
			URL:            "/api/packs/pending/export",
			ExpectedStatus: http.StatusServiceUnavailable,
			ExpectedContent: []string{
				`"code":"cli_missing"`,
			},
			NotExpectedContent: []string{
				`"validation_invalid_value"`,
			},
			TestAppFactory: contractTestApp,
		}
		scenario.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			Register(e)
			r := seedPack(t, app, root, "local")
			scenario.URL = "/api/packs/" + r.Id + "/export"
		}
		scenario.Test(t)
	})
}

func TestHTTPDeletePack(t *testing.T) {
	stubCLIMissing(t)

	t.Run("204 delete_files local", func(t *testing.T) {
		root := writeSamplePack(t, "1.0.0")
		scenario := tests.ApiScenario{
			Name:           "DELETE 204 delete_files local",
			Method:         http.MethodDelete,
			URL:            "/api/packs/pending",
			Body:           strings.NewReader(`{"delete_files":true}`),
			ExpectedStatus: http.StatusNoContent,
			TestAppFactory: contractTestApp,
		}
		scenario.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			Register(e)
			r := seedPack(t, app, root, "local")
			scenario.URL = "/api/packs/" + r.Id
		}
		scenario.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
			if _, err := os.Stat(root); !os.IsNotExist(err) {
				t.Fatalf("expected disk delete, stat err=%v", err)
			}
		}
		scenario.Test(t)
	})

	t.Run("400 delete_files non-local", func(t *testing.T) {
		root := writeSamplePack(t, "1.0.0")
		scenario := tests.ApiScenario{
			Name:           "DELETE 400 delete_files_not_local",
			Method:         http.MethodDelete,
			URL:            "/api/packs/pending",
			Body:           strings.NewReader(`{"delete_files":true}`),
			ExpectedStatus: http.StatusBadRequest,
			ExpectedContent: []string{
				`"code":"delete_files_not_local"`,
			},
			TestAppFactory: contractTestApp,
		}
		scenario.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
			Register(e)
			r := seedPack(t, app, root, "remote")
			scenario.URL = "/api/packs/" + r.Id
		}
		scenario.Test(t)
	})
}

func TestHTTPConcurrentRefreshConflict(t *testing.T) {
	stubCLIMissing(t)
	root := writeSamplePack(t, "1.0.0")

	refreshConflict := tests.ApiScenario{
		Name:           "concurrent refresh → 409 pack_busy",
		Method:         http.MethodPost,
		URL:            "/api/packs/pending/refresh",
		ExpectedStatus: http.StatusConflict,
		ExpectedContent: []string{
			`"code":"pack_busy"`,
		},
		TestAppFactory: contractTestApp,
	}
	refreshConflict.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		r := seedPack(t, app, root, "local")
		if !defaultPackLocks.TryLock(r.Id) {
			t.Fatal("failed to hold lock for conflict test")
		}
		t.Cleanup(func() { defaultPackLocks.Unlock(r.Id) })
		refreshConflict.URL = "/api/packs/" + r.Id + "/refresh"
	}
	refreshConflict.Test(t)

	exportConflict := tests.ApiScenario{
		Name:           "concurrent export → 409 pack_busy",
		Method:         http.MethodPost,
		URL:            "/api/packs/pending/export",
		ExpectedStatus: http.StatusConflict,
		ExpectedContent: []string{
			`"code":"pack_busy"`,
		},
		TestAppFactory: contractTestApp,
	}
	exportConflict.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		r := seedPack(t, app, root, "local")
		if !defaultPackLocks.TryLock(r.Id) {
			t.Fatal("failed to hold lock for conflict test")
		}
		t.Cleanup(func() { defaultPackLocks.Unlock(r.Id) })
		exportConflict.URL = "/api/packs/" + r.Id + "/export"
	}
	exportConflict.Test(t)
}

func contractTestApp(t testing.TB) *tests.TestApp {
	t.Helper()
	app, err := tests.NewTestApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewTestApp: %v", err)
	}
	if err := collections.Bootstrap(app); err != nil {
		app.Cleanup()
		t.Fatalf("Bootstrap: %v", err)
	}
	return app
}

func registerRoutes(t testing.TB, _ *tests.TestApp, e *core.ServeEvent) {
	t.Helper()
	Register(e)
}

func stubCLIMissing(t *testing.T) {
	t.Helper()
	restore := cli.StubLookPath(func(string) (string, error) {
		return "", errors.New("not found")
	})
	t.Cleanup(restore)
}

func seedPack(t testing.TB, app core.App, root, origin string) *core.Record {
	t.Helper()
	sp, err := loadPackFromDisk(root, false)
	if err != nil {
		t.Fatalf("loadPackFromDisk: %v", err)
	}
	rec, err := persistScannedPack(app, nil, sp, historySourceImport)
	if err != nil {
		t.Fatalf("persist: %v", err)
	}
	if origin != "local" {
		rec.Set("origin", origin)
		if err := app.Save(rec); err != nil {
			t.Fatalf("set origin: %v", err)
		}
	}
	return rec
}
