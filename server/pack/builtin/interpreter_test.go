package builtin

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func writeFixture(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write fixture %s: %v", name, err)
	}
	return path
}

func TestResolveShebangInterpreter(t *testing.T) {
	dir := t.TempDir()

	tests := []struct {
		name     string
		content  string
		wantPath string
		wantErr  bool
	}{
		{
			name:     "env indirection",
			content:  "#!/usr/bin/env python3\nprint('hi')\n",
			wantPath: "python3",
		},
		{
			name:     "direct interpreter path",
			content:  "#!/usr/bin/python3.11\nprint('hi')\n",
			wantPath: "/usr/bin/python3.11",
		},
		{
			// Regression: pipx venv shims emit a direct interpreter path
			// followed by flags (e.g. "-E" to ignore PYTHON* env vars),
			// not env-indirection. Taking the last field here would
			// misidentify "-E" as the interpreter.
			name:     "direct interpreter path with trailing flags",
			content:  "#!/Users/dev/.local/pipx/venvs/spec-kitty-cli/bin/python -E\nprint('hi')\n",
			wantPath: "/Users/dev/.local/pipx/venvs/spec-kitty-cli/bin/python",
		},
		{
			name:    "no shebang",
			content: "print('hi')\n",
			wantErr: true,
		},
		{
			name:    "empty file",
			content: "",
			wantErr: true,
		},
		{
			name:     "crlf line endings",
			content:  "#!/usr/bin/env python3\r\nprint('hi')\r\n",
			wantPath: "python3",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := writeFixture(t, dir, tt.name+".fixture", tt.content)
			got, err := resolveShebangInterpreter(path)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got interpreter %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.wantPath {
				t.Fatalf("got %q, want %q", got, tt.wantPath)
			}
		})
	}
}

func TestResolveShebangInterpreter_UnreadableFile(t *testing.T) {
	_, err := resolveShebangInterpreter(filepath.Join(t.TempDir(), "does-not-exist"))
	if err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestResolveInterpreter_LookPathFails(t *testing.T) {
	restore := StubLookPathFn(func(file string) (string, error) {
		return "", errors.New("not found")
	})
	defer restore()

	_, err := ResolveInterpreter()
	if err == nil {
		t.Fatal("expected error when spec-kitty is not on PATH, got nil")
	}
}

func TestResolveInterpreter_Success(t *testing.T) {
	dir := t.TempDir()
	fakeExe := writeFixture(t, dir, "spec-kitty", "#!/usr/bin/env python3\n")

	restore := StubLookPathFn(func(file string) (string, error) {
		if file != "spec-kitty" {
			return "", errors.New("unexpected lookup: " + file)
		}
		return fakeExe, nil
	})
	defer restore()

	got, err := ResolveInterpreter()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "python3" {
		t.Fatalf("got %q, want %q", got, "python3")
	}
}

func TestResolveDoctrineDir_LookPathFails(t *testing.T) {
	restore := StubLookPathFn(func(file string) (string, error) {
		return "", errors.New("not found")
	})
	defer restore()

	_, err := ResolveDoctrineDir()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

// fakeCommand builds an *exec.Cmd that re-invokes the current test binary as
// a subprocess helper (the standard Go pattern for stubbing exec.Command),
// so ResolveDoctrineDir's commandFactoryFn can be exercised without a real
// Python interpreter present.
func fakeCommand(helperName string) func(name string, args ...string) *exec.Cmd {
	return func(name string, args ...string) *exec.Cmd {
		cs := []string{"-test.run=TestHelperProcess", "--", helperName, name}
		cs = append(cs, args...)
		cmd := exec.Command(os.Args[0], cs...)
		cmd.Env = append(os.Environ(), "GO_WANT_HELPER_PROCESS=1")
		return cmd
	}
}

func TestHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}
	defer os.Exit(0)

	args := os.Args
	for len(args) > 0 {
		if args[0] == "--" {
			args = args[1:]
			break
		}
		args = args[1:]
	}
	if len(args) < 1 {
		os.Exit(2)
	}

	switch args[0] {
	case "print-path":
		os.Stdout.WriteString("/fake/doctrine/pkg\n")
		os.Exit(0)
	case "fail":
		os.Stderr.WriteString("boom\n")
		os.Exit(1)
	case "print-empty":
		os.Exit(0)
	default:
		os.Exit(2)
	}
}

func TestResolveDoctrineDir_CommandSucceeds(t *testing.T) {
	dir := t.TempDir()
	fakeExe := writeFixture(t, dir, "spec-kitty", "#!/usr/bin/env python3\n")

	restoreLookPath := StubLookPathFn(func(file string) (string, error) {
		return fakeExe, nil
	})
	defer restoreLookPath()

	restoreCommand := StubCommandFactoryFn(fakeCommand("print-path"))
	defer restoreCommand()

	got, err := ResolveDoctrineDir()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "/fake/doctrine/pkg" {
		t.Fatalf("got %q, want %q", got, "/fake/doctrine/pkg")
	}
}

func TestResolveDoctrineDir_CommandFails(t *testing.T) {
	dir := t.TempDir()
	fakeExe := writeFixture(t, dir, "spec-kitty", "#!/usr/bin/env python3\n")

	restoreLookPath := StubLookPathFn(func(file string) (string, error) {
		return fakeExe, nil
	})
	defer restoreLookPath()

	restoreCommand := StubCommandFactoryFn(fakeCommand("fail"))
	defer restoreCommand()

	_, err := ResolveDoctrineDir()
	if err == nil {
		t.Fatal("expected error for non-zero exit, got nil")
	}
}

func TestResolveDoctrineDir_EmptyOutput(t *testing.T) {
	dir := t.TempDir()
	fakeExe := writeFixture(t, dir, "spec-kitty", "#!/usr/bin/env python3\n")

	restoreLookPath := StubLookPathFn(func(file string) (string, error) {
		return fakeExe, nil
	})
	defer restoreLookPath()

	restoreCommand := StubCommandFactoryFn(fakeCommand("print-empty"))
	defer restoreCommand()

	_, err := ResolveDoctrineDir()
	if err == nil {
		t.Fatal("expected error for empty output, got nil")
	}
}
