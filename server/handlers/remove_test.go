package handlers

import (
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

// TestHTTPDeleteBuiltinPackRejected covers T018/T019: DELETE on a
// origin=built-in pack must be rejected with 400 builtin_not_removable,
// regardless of the delete_files flag.
func TestHTTPDeleteBuiltinPackRejected(t *testing.T) {
	stubCLIMissing(t)
	root := writeSamplePack(t, "1.0.0")

	scenario := tests.ApiScenario{
		Name:           "DELETE 400 builtin_not_removable",
		Method:         http.MethodDelete,
		URL:            "/api/packs/pending",
		Body:           strings.NewReader(`{"delete_files":false}`),
		ExpectedStatus: http.StatusBadRequest,
		ExpectedContent: []string{
			`"code":"builtin_not_removable"`,
		},
		TestAppFactory: contractTestApp,
	}
	scenario.BeforeTestFunc = func(t testing.TB, app *tests.TestApp, e *core.ServeEvent) {
		Register(e)
		r := seedPack(t, app, root, "built-in")
		scenario.URL = "/api/packs/" + r.Id
	}
	scenario.Test(t)
}
