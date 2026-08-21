package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

// ValidationStatus matches packs.validation_status select values.
type ValidationStatus string

const (
	StatusValid   ValidationStatus = "valid"
	StatusErrors  ValidationStatus = "errors"
	StatusUnknown ValidationStatus = "unknown"
)

// ErrCLINotInstalled is returned when `spec-kitty` is not on PATH.
// Handlers should map this to HTTP 503.
var ErrCLINotInstalled = errors.New("spec-kitty CLI not installed")

// ValidationResult is the structured outcome of doctrine pack validate.
type ValidationResult struct {
	Status   ValidationStatus `json:"status"`
	Errors   []string         `json:"errors"`
	ExitCode int              `json:"exit_code"`
	Stdout   string           `json:"stdout,omitempty"`
	Stderr   string           `json:"stderr,omitempty"`
}

// lookPath is overridable in tests.
var lookPath = exec.LookPath

// commandContext is overridable in tests; defaults to exec.Command.
var commandFactory = func(name string, args ...string) *exec.Cmd {
	return exec.Command(name, args...)
}

// StubLookPath overrides LookPath for tests. Call the returned restore func to reset.
func StubLookPath(fn func(file string) (string, error)) (restore func()) {
	prev := lookPath
	lookPath = fn
	return func() { lookPath = prev }
}

// StubCommandFactory overrides command creation for tests. Call restore to reset.
func StubCommandFactory(fn func(name string, args ...string) *exec.Cmd) (restore func()) {
	prev := commandFactory
	commandFactory = fn
	return func() { commandFactory = prev }
}

// ValidatePack shells out to `spec-kitty doctrine pack validate --json <path>`.
// Missing CLI returns ErrCLINotInstalled (clear error for 503 upstream).
func ValidatePack(packPath string) (*ValidationResult, error) {
	if _, err := lookPath("spec-kitty"); err != nil {
		return nil, fmt.Errorf("%w: install Spec Kitty CLI and ensure it is on PATH", ErrCLINotInstalled)
	}

	cmd := commandFactory("spec-kitty", "doctrine", "pack", "validate", "--json", packPath)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()
	exitCode := 0
	if runErr != nil {
		var ee *exec.ExitError
		if errors.As(runErr, &ee) {
			exitCode = ee.ExitCode()
		} else {
			return &ValidationResult{
				Status:   StatusUnknown,
				Errors:   []string{runErr.Error()},
				ExitCode: -1,
				Stdout:   stdout.String(),
				Stderr:   stderr.String(),
			}, nil
		}
	}

	result := &ValidationResult{
		ExitCode: exitCode,
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		Errors:   extractMessages(stdout.Bytes(), stderr.String()),
	}

	switch exitCode {
	case 0:
		result.Status = StatusValid
	case 1:
		result.Status = StatusErrors
	default:
		result.Status = StatusUnknown
	}
	return result, nil
}

func extractMessages(stdout []byte, stderr string) []string {
	var msgs []string
	var payload struct {
		Errors     []any `json:"errors"`
		Advisories []any `json:"advisories"`
		OK         *bool `json:"ok"`
	}
	if len(bytes.TrimSpace(stdout)) > 0 {
		if err := json.Unmarshal(stdout, &payload); err == nil {
			for _, e := range payload.Errors {
				msgs = append(msgs, fmt.Sprint(e))
			}
			if len(msgs) > 0 {
				return msgs
			}
		} else {
			trimmed := strings.TrimSpace(string(stdout))
			if trimmed != "" {
				msgs = append(msgs, trimmed)
			}
		}
	}
	if s := strings.TrimSpace(stderr); s != "" {
		msgs = append(msgs, s)
	}
	return msgs
}
