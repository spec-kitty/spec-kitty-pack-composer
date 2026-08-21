package cli

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spec-kitty/pack-composer/server/charter"
)

// All tests in this file use cli.StubLookPath / cli.StubCommandFactory
// (same mechanism as validate_test.go) so none of them require a real
// git or spec-kitty binary to be installed. commandFactory is called
// three times per ValidateCharterBundle call (git init, git add,
// spec-kitty charter bundle validate) — stub funcs below route on the
// requested binary `name` so `git` steps always no-op-succeed while
// `spec-kitty` returns a canned validate --json payload.

func sampleBundle() *charter.CharterBundle {
	return &charter.CharterBundle{
		CharterMD:      []byte("# Charter A\n"),
		GovernanceYAML: []byte("doctrine: {}\n"),
		DirectivesYAML: []byte("directives: []\n"),
		MetadataYAML:   []byte("bundle_schema_version: 2\n"),
	}
}

// stubGitAndSpecKitty stubs lookPath to succeed for both binaries and
// commandFactory to run okScript for `git` and specKittyScript for
// `spec-kitty`.
func stubGitAndSpecKitty(t *testing.T, specKittyScript string) {
	t.Helper()

	scriptDir := t.TempDir()
	okScript := filepath.Join(scriptDir, "ok.sh")
	if err := os.WriteFile(okScript, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write ok script: %v", err)
	}

	restoreLook := StubLookPath(func(string) (string, error) { return "/bin/true", nil })
	t.Cleanup(restoreLook)

	restoreCmd := StubCommandFactory(func(name string, args ...string) *exec.Cmd {
		if name == "spec-kitty" {
			return exec.Command(specKittyScript)
		}
		return exec.Command(okScript)
	})
	t.Cleanup(restoreCmd)
}

func writeSpecKittyScript(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "spec-kitty.sh")
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		t.Fatalf("write spec-kitty script: %v", err)
	}
	return path
}

func TestValidateCharterBundleValid(t *testing.T) {
	script := writeSpecKittyScript(t, "#!/bin/sh\necho '{\"passed\":true,\"result\":\"success\",\"errors\":[]}'\nexit 0\n")
	stubGitAndSpecKitty(t, script)

	res, err := ValidateCharterBundle(sampleBundle())
	if err != nil {
		t.Fatalf("ValidateCharterBundle returned error: %v", err)
	}
	if res.Status != StatusValid || res.ExitCode != 0 {
		t.Errorf("valid case: %#v", res)
	}
}

func TestValidateCharterBundleErrors(t *testing.T) {
	script := writeSpecKittyScript(t, "#!/bin/sh\necho '{\"passed\":false,\"result\":\"failure\",\"errors\":[\"compatibility: Bundle schema version not found\"]}'\nexit 1\n")
	stubGitAndSpecKitty(t, script)

	res, err := ValidateCharterBundle(sampleBundle())
	if err != nil {
		t.Fatalf("ValidateCharterBundle returned error: %v", err)
	}
	if res.Status != StatusErrors || res.ExitCode != 1 {
		t.Errorf("errors case: %#v", res)
	}
	if len(res.Errors) != 1 || !strings.Contains(res.Errors[0], "Bundle schema version") {
		t.Errorf("error messages = %#v", res.Errors)
	}
}

func countCharterBundleTempDirs(t *testing.T) int {
	t.Helper()
	entries, err := os.ReadDir(os.TempDir())
	if err != nil {
		t.Fatalf("read temp dir: %v", err)
	}
	n := 0
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "charter-bundle-") {
			n++
		}
	}
	return n
}

func TestValidateCharterBundleMissingGit(t *testing.T) {
	before := countCharterBundleTempDirs(t)

	restoreLook := StubLookPath(func(name string) (string, error) {
		if name == "git" {
			return "", errors.New("not found")
		}
		return "/bin/true", nil
	})
	t.Cleanup(restoreLook)

	_, err := ValidateCharterBundle(sampleBundle())
	if !errors.Is(err, ErrGitNotInstalled) {
		t.Fatalf("want ErrGitNotInstalled, got %v", err)
	}

	if after := countCharterBundleTempDirs(t); after != before {
		t.Errorf("missing-git path must not leave a charter-bundle-* temp dir behind: before=%d after=%d", before, after)
	}
}

func TestValidateCharterBundleMissingSpecKitty(t *testing.T) {
	before := countCharterBundleTempDirs(t)

	restoreLook := StubLookPath(func(name string) (string, error) {
		if name == "spec-kitty" {
			return "", errors.New("not found")
		}
		return "/bin/true", nil
	})
	t.Cleanup(restoreLook)

	_, err := ValidateCharterBundle(sampleBundle())
	if !errors.Is(err, ErrCLINotInstalled) {
		t.Fatalf("want ErrCLINotInstalled, got %v", err)
	}

	if after := countCharterBundleTempDirs(t); after != before {
		t.Errorf("missing-spec-kitty path must not leave a charter-bundle-* temp dir behind: before=%d after=%d", before, after)
	}
}

func TestValidateCharterBundleCleansUpTempDirOnSuccess(t *testing.T) {
	script := writeSpecKittyScript(t, "#!/bin/sh\necho '{\"passed\":true,\"errors\":[]}'\nexit 0\n")
	stubGitAndSpecKitty(t, script)

	before := countCharterBundleTempDirs(t)
	res, err := ValidateCharterBundle(sampleBundle())
	if err != nil {
		t.Fatalf("ValidateCharterBundle returned error: %v", err)
	}
	if res.Status != StatusValid {
		t.Fatalf("expected valid status, got %#v", res)
	}
	if after := countCharterBundleTempDirs(t); after != before {
		t.Errorf("temp dir not cleaned up: before=%d after=%d", before, after)
	}
}

// TestValidateCharterBundleRealCLI is a manual, opt-in smoke test against
// the real installed git + spec-kitty binaries — it is skipped unless
// CHARTER_VALIDATE_REAL_CLI=1 is set, so committed CI runs never depend
// on either binary being present (per this WP's risk notes: real-CLI
// testing belongs in a documented manual smoke test, not the automated
// suite). Run locally with:
//
//	CHARTER_VALIDATE_REAL_CLI=1 go test ./cli/... -run RealCLI -v
func TestValidateCharterBundleRealCLI(t *testing.T) {
	if os.Getenv("CHARTER_VALIDATE_REAL_CLI") != "1" {
		t.Skip("set CHARTER_VALIDATE_REAL_CLI=1 to run against the real git/spec-kitty binaries")
	}

	res, err := ValidateCharterBundle(sampleBundle())
	if err != nil {
		t.Fatalf("ValidateCharterBundle returned error against real CLI: %v", err)
	}
	if res.Status != StatusValid {
		t.Errorf("expected a correctly-assembled bundle to validate against the real CLI, got %#v", res)
	}
}
