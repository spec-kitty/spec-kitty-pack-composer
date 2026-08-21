package cli

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestValidatePackMissingCLI(t *testing.T) {
	orig := lookPath
	t.Cleanup(func() { lookPath = orig })
	lookPath = func(string) (string, error) {
		return "", errors.New("not found")
	}

	_, err := ValidatePack("/tmp/does-not-matter")
	if !errors.Is(err, ErrCLINotInstalled) {
		t.Fatalf("want ErrCLINotInstalled, got %v", err)
	}
}

func TestValidatePackMapsExitCodes(t *testing.T) {
	origLook := lookPath
	origCmd := commandFactory
	t.Cleanup(func() {
		lookPath = origLook
		commandFactory = origCmd
	})
	lookPath = func(string) (string, error) { return "/bin/true", nil }

	scriptDir := t.TempDir()
	okScript := filepath.Join(scriptDir, "ok.sh")
	errScript := filepath.Join(scriptDir, "err.sh")
	mustWrite(t, okScript, "#!/bin/sh\necho '{\"ok\":true,\"errors\":[]}'\nexit 0\n")
	mustWrite(t, errScript, "#!/bin/sh\necho '{\"ok\":false,\"errors\":[\"boom\"]}'\nexit 1\n")
	_ = os.Chmod(okScript, 0o755)
	_ = os.Chmod(errScript, 0o755)

	commandFactory = func(name string, args ...string) *exec.Cmd {
		return exec.Command(okScript)
	}
	res, err := ValidatePack("/pack")
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != StatusValid || res.ExitCode != 0 {
		t.Errorf("valid: %#v", res)
	}

	commandFactory = func(name string, args ...string) *exec.Cmd {
		return exec.Command(errScript)
	}
	res, err = ValidatePack("/pack")
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != StatusErrors || res.ExitCode != 1 {
		t.Errorf("errors: %#v", res)
	}
	if len(res.Errors) != 1 || res.Errors[0] != "boom" {
		t.Errorf("error msgs: %#v", res.Errors)
	}
}

func mustWrite(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}
