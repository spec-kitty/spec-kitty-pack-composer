// Package builtin sources Spec Kitty's built-in doctrine content (directives,
// tactics, procedures, styleguides, toolguides, mission step contracts) so it
// can be composed into a synthetic "built-in" pack at server bootstrap.
//
// This file resolves the Python interpreter behind an installed `spec-kitty`
// CLI, then uses it to locate the on-disk `doctrine` package directory,
// without hardcoding any install-method-specific path (pipx, pip --user,
// project venv, etc. are all supported uniformly via the shebang line).
package builtin

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// lookPathFn is overridable in tests (mirrors cli.lookPath's pattern).
var lookPathFn = exec.LookPath

// StubLookPathFn overrides lookPathFn for tests. Call the returned restore
// func to reset.
func StubLookPathFn(fn func(file string) (string, error)) (restore func()) {
	prev := lookPathFn
	lookPathFn = fn
	return func() { lookPathFn = prev }
}

// commandFactoryFn is overridable in tests (mirrors cli.commandFactory's pattern).
var commandFactoryFn = func(name string, args ...string) *exec.Cmd {
	return exec.Command(name, args...)
}

// StubCommandFactoryFn overrides commandFactoryFn for tests. Call the
// returned restore func to reset.
func StubCommandFactoryFn(fn func(name string, args ...string) *exec.Cmd) (restore func()) {
	prev := commandFactoryFn
	commandFactoryFn = fn
	return func() { commandFactoryFn = prev }
}

// resolveShebangInterpreter reads only the first line of executablePath and
// extracts the interpreter path from a shebang line. It supports both the
// single-token form (#!/path/to/python3) and the env-indirection two-token
// form (#!/usr/bin/env python3), and tolerates both \n and \r\n line endings.
// It never panics: any I/O or format problem is returned as an error.
func resolveShebangInterpreter(executablePath string) (string, error) {
	f, err := os.Open(executablePath)
	if err != nil {
		return "", fmt.Errorf("builtin: open executable: %w", err)
	}
	defer f.Close()

	reader := bufio.NewReader(f)
	line, err := reader.ReadString('\n')
	if err != nil && line == "" {
		return "", fmt.Errorf("builtin: read shebang line: %w", err)
	}
	line = strings.TrimRight(line, "\r\n")

	if !strings.HasPrefix(line, "#!") {
		return "", fmt.Errorf("builtin: %s has no shebang line", executablePath)
	}

	rest := strings.TrimSpace(strings.TrimPrefix(line, "#!"))
	if rest == "" {
		return "", fmt.Errorf("builtin: %s has an empty shebang line", executablePath)
	}

	fields := strings.Fields(rest)
	// Two shebang forms are in play here:
	//   - env-indirection: "#!/usr/bin/env python3" — the real interpreter
	//     is the argument to `env`, i.e. the last field.
	//   - direct-path (optionally with flags, as pipx emits for its venv
	//     shims): "#!/path/to/python -E" — the real interpreter is the
	//     first field; any trailing tokens are flags, not another command.
	// Using the last field unconditionally (as in the direct-path+flags
	// case) would misidentify a flag like "-E" as the interpreter.
	var interpreter string
	if filepath.Base(fields[0]) == "env" && len(fields) > 1 {
		interpreter = fields[len(fields)-1]
	} else {
		interpreter = fields[0]
	}
	if interpreter == "" {
		return "", fmt.Errorf("builtin: %s has an unparseable shebang line", executablePath)
	}
	return interpreter, nil
}

// ResolveInterpreter locates the `spec-kitty` executable on PATH and returns
// the Python interpreter path found in its shebang line. Any failure
// (executable not found, unreadable/unexpected shebang) is returned as an
// error; callers must treat this as non-fatal and degrade gracefully.
func ResolveInterpreter() (string, error) {
	execPath, err := lookPathFn("spec-kitty")
	if err != nil {
		return "", fmt.Errorf("builtin: resolve spec-kitty executable: %w", err)
	}
	interpreter, err := resolveShebangInterpreter(execPath)
	if err != nil {
		return "", err
	}
	return interpreter, nil
}

// ResolveDoctrineDir resolves the Python interpreter behind `spec-kitty` and
// invokes it to report the on-disk directory of the installed `doctrine`
// package. Any failure (interpreter resolution, non-zero exit, empty output)
// is returned as an error; callers must treat this as non-fatal.
func ResolveDoctrineDir() (string, error) {
	interpreterPath, err := ResolveInterpreter()
	if err != nil {
		return "", err
	}

	script := "import os, doctrine; print(os.path.dirname(doctrine.__file__))"
	cmd := commandFactoryFn(interpreterPath, "-c", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("builtin: invoke interpreter for doctrine dir: %w (stderr: %s)", err, strings.TrimSpace(stderr.String()))
	}

	dir := strings.TrimSpace(stdout.String())
	if dir == "" {
		return "", errors.New("builtin: interpreter reported empty doctrine directory")
	}
	return dir, nil
}
