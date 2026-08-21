package cli

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/spec-kitty/pack-composer/server/charter"
)

// ErrGitNotInstalled is returned when `git` is not on PATH. Handlers should
// map this to HTTP 503, same as ErrCLINotInstalled.
var ErrGitNotInstalled = errors.New("git not installed")

// charterValidateTimeout bounds every individual shelled-out step (git
// init, git add, spec-kitty charter bundle validate) so a hung subprocess
// can't block an export request forever.
const charterValidateTimeout = 30 * time.Second

// bundleFileNames are the four files ValidateCharterBundle writes into the
// ephemeral repo, in the exact order they must be written (charter.md
// first, matching AssembleBundle's own dependency order is not required
// here since these are already-built bytes, but keeping a fixed order
// keeps the on-disk layout deterministic for debugging).
var bundleFileNames = []string{"charter.md", "governance.yaml", "directives.yaml", "metadata.yaml"}

// ValidateCharterBundle builds a throwaway git repository under a fresh
// temp directory, writes bundle's four files into
// .kittify/charter/<name>, and shells out to the real
// `spec-kitty charter bundle validate --json` command from inside that
// directory. The temp directory is always removed before returning,
// including every error path.
//
// Empirically confirmed (2026-08-17, real spec-kitty CLI): only
// charter.md needs to be git-tracked ("tracked_files"); governance.yaml,
// directives.yaml, and metadata.yaml must instead be listed in .gitignore
// ("derived_files") — tracking all four causes bundle_compliant=false. No
// git commit is required; the CLI classifies tracked/untracked files off
// the git index alone.
func ValidateCharterBundle(bundle *charter.CharterBundle) (*ValidationResult, error) {
	if _, err := lookPath("git"); err != nil {
		return nil, fmt.Errorf("%w: install git and ensure it is on PATH", ErrGitNotInstalled)
	}
	if _, err := lookPath("spec-kitty"); err != nil {
		return nil, fmt.Errorf("%w: install Spec Kitty CLI and ensure it is on PATH", ErrCLINotInstalled)
	}

	tmpDir, err := os.MkdirTemp("", "charter-bundle-*")
	if err != nil {
		return nil, fmt.Errorf("charter validate: create ephemeral repo: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	if err := writeEphemeralBundle(tmpDir, bundle); err != nil {
		return nil, err
	}

	if err := runGitStep(tmpDir, "init"); err != nil {
		return nil, fmt.Errorf("charter validate: git init: %w", err)
	}
	// Only .gitignore + charter.md are git-tracked; the three derived
	// files stay untracked-but-gitignored (see the doc comment above).
	if err := runGitStep(tmpDir, "add", ".gitignore", filepath.ToSlash(filepath.Join(".kittify", "charter", "charter.md"))); err != nil {
		return nil, fmt.Errorf("charter validate: git add: %w", err)
	}

	cmd := commandFactory("spec-kitty", "charter", "bundle", "validate", "--json")
	cmd.Dir = tmpDir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := runWithTimeout(cmd, charterValidateTimeout)
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

// writeEphemeralBundle writes bundle's four files under
// tmpDir/.kittify/charter/ plus a root .gitignore covering the three
// derived files. It never creates anything else — in particular, no
// .kittify/doctrine/, .kittify/charter/provenance/, or
// synthesis-manifest.yaml, which would activate the real CLI's stricter
// validate_synthesis_state checks that this throwaway repo has no way to
// satisfy.
func writeEphemeralBundle(tmpDir string, bundle *charter.CharterBundle) error {
	charterDir := filepath.Join(tmpDir, ".kittify", "charter")
	if err := os.MkdirAll(charterDir, 0o755); err != nil {
		return fmt.Errorf("charter validate: create bundle dir: %w", err)
	}

	contents := map[string][]byte{
		"charter.md":      bundle.CharterMD,
		"governance.yaml": bundle.GovernanceYAML,
		"directives.yaml": bundle.DirectivesYAML,
		"metadata.yaml":   bundle.MetadataYAML,
	}
	for _, name := range bundleFileNames {
		if err := os.WriteFile(filepath.Join(charterDir, name), contents[name], 0o644); err != nil {
			return fmt.Errorf("charter validate: write %s: %w", name, err)
		}
	}

	gitignore := strings.Join([]string{
		".kittify/charter/governance.yaml",
		".kittify/charter/directives.yaml",
		".kittify/charter/metadata.yaml",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(tmpDir, ".gitignore"), []byte(gitignore), 0o644); err != nil {
		return fmt.Errorf("charter validate: write .gitignore: %w", err)
	}
	return nil
}

// runGitStep runs `git <args...>` inside dir via the overridable
// commandFactory, so tests can stub it alongside the spec-kitty call.
func runGitStep(dir string, args ...string) error {
	cmd := commandFactory("git", args...)
	cmd.Dir = dir
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := runWithTimeout(cmd, charterValidateTimeout); err != nil {
		if msg := strings.TrimSpace(stderr.String()); msg != "" {
			return fmt.Errorf("%w: %s", err, msg)
		}
		return err
	}
	return nil
}

// runWithTimeout starts cmd and kills it if it hasn't finished within
// timeout, so a hung git/spec-kitty process can't block an export request
// indefinitely.
func runWithTimeout(cmd *exec.Cmd, timeout time.Duration) error {
	if err := cmd.Start(); err != nil {
		return err
	}

	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()

	select {
	case err := <-done:
		return err
	case <-time.After(timeout):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		<-done
		return fmt.Errorf("command timed out after %s", timeout)
	}
}
