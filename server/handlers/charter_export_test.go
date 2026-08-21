package handlers

import (
	"errors"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/spec-kitty/pack-composer/server/cli"
)

// charterExportTestApp mirrors charterItemsTestApp for WP06's export tests.
func charterExportTestApp(t testing.TB) *tests.TestApp {
	t.Helper()
	return contractTestApp(t)
}

// stubGitAndSpecKittyForExport routes commandFactory by binary name so
// `git` steps always no-op-succeed while `spec-kitty` returns
// specKittyScript's canned output — mirrors
// cli.charter_validate_test.go's stubGitAndSpecKitty (that helper lives in
// package cli, unexported, so handler tests reimplement the same stub
// shape here).
func stubGitAndSpecKittyForExport(t testing.TB, specKittyScript string) {
	t.Helper()

	scriptDir := t.TempDir()
	okScript := filepath.Join(scriptDir, "ok.sh")
	if err := os.WriteFile(okScript, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write ok script: %v", err)
	}

	restoreLook := cli.StubLookPath(func(string) (string, error) { return "/bin/true", nil })
	t.Cleanup(restoreLook)

	restoreCmd := cli.StubCommandFactory(func(name string, args ...string) *exec.Cmd {
		if name == "spec-kitty" {
			return exec.Command(specKittyScript)
		}
		return exec.Command(okScript)
	})
	t.Cleanup(restoreCmd)
}

func writeSpecKittyScriptFor(t testing.TB, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "spec-kitty.sh")
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		t.Fatalf("write spec-kitty script: %v", err)
	}
	return path
}

func TestHTTPExportCharterSuccessWithValidationErrors(t *testing.T) {
	script := writeSpecKittyScriptFor(t, "#!/bin/sh\necho '{\"passed\":false,\"errors\":[\"bad\"]}'\nexit 1\n")

	sc := tests.ApiScenario{
		Name:           "export returns zip even when validation reports errors",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			"PK", // ZIP local-file header magic
		},
		TestAppFactory: charterExportTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		stubGitAndSpecKittyForExport(t, script)
		c := seedCharter(t, app, "Charter A", true)
		_, art := seedPackWithArtifact(t, app, "pack1", "directive", "X", "Directive X")
		addItemDirect(t, app, c.Id, art.Id)
		sc.URL = "/api/charters/" + c.Id + "/export"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		if got := res.Header.Get("X-Charter-Validation-Status"); got != string(cli.StatusErrors) {
			t.Errorf("X-Charter-Validation-Status = %q, want %q", got, cli.StatusErrors)
		}
		if got := res.Header.Get("X-Charter-Validation-Errors"); got == "" {
			t.Error("X-Charter-Validation-Errors must be set when validation reports errors")
		}
		if got := res.Header.Get("Content-Disposition"); got == "" {
			t.Error("Content-Disposition must be set on a successful export")
		}
	}
	sc.Test(t)
}

func TestHTTPExportCharterZeroItemsStillSucceeds(t *testing.T) {
	script := writeSpecKittyScriptFor(t, "#!/bin/sh\necho '{\"passed\":true,\"errors\":[]}'\nexit 0\n")

	sc := tests.ApiScenario{
		Name:           "export succeeds for a charter with zero enabled items",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusOK,
		ExpectedContent: []string{
			"PK",
		},
		TestAppFactory: charterExportTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		stubGitAndSpecKittyForExport(t, script)
		c := seedCharter(t, app, "Charter Empty", true)
		sc.URL = "/api/charters/" + c.Id + "/export"
	}
	sc.AfterTestFunc = func(t testing.TB, app *tests.TestApp, res *http.Response) {
		if got := res.Header.Get("X-Charter-Validation-Errors"); got == "" {
			t.Error("zero-enabled-items export should surface a synthetic warning via X-Charter-Validation-Errors")
		}
	}
	sc.Test(t)
}

func TestHTTPExportCharterMissingCLIReturns503(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "export 503 when git/spec-kitty missing",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusServiceUnavailable,
		ExpectedContent: []string{
			`"code":"cli_missing"`,
		},
		TestAppFactory: charterExportTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		restore := cli.StubLookPath(func(string) (string, error) {
			return "", errors.New("not found")
		})
		t.Cleanup(restore)
		c := seedCharter(t, app, "Charter A", true)
		sc.URL = "/api/charters/" + c.Id + "/export"
	}
	sc.Test(t)
}

func TestHTTPExportCharterNotFound(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "export unknown charter → 404",
		Method:         http.MethodPost,
		URL:            "/api/charters/does-not-exist-00/export",
		ExpectedStatus: http.StatusNotFound,
		ExpectedContent: []string{
			`"code":"not_found"`,
		},
		TestAppFactory: charterExportTestApp,
		BeforeTestFunc: registerRoutes,
	}
	sc.Test(t)
}

func TestHTTPExportCharterConcurrentReturns409(t *testing.T) {
	sc := tests.ApiScenario{
		Name:           "concurrent export → 409 charter_busy",
		Method:         http.MethodPost,
		ExpectedStatus: http.StatusConflict,
		ExpectedContent: []string{
			`"code":"charter_busy"`,
		},
		TestAppFactory: charterExportTestApp,
	}
	sc.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		c := seedCharter(t, app, "Charter A", true)
		if !defaultCharterLocks.TryLock(c.Id) {
			t.Fatal("failed to acquire simulated in-flight export lock")
		}
		t.Cleanup(func() { defaultCharterLocks.Unlock(c.Id) })
		sc.URL = "/api/charters/" + c.Id + "/export"
	}
	sc.Test(t)
}
