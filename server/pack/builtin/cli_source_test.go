package builtin

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/spec-kitty/pack-composer/server/cli"
	"github.com/spec-kitty/pack-composer/server/pack"
)

func writeFakeScript(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "fake-spec-kitty.sh")
	if err := os.WriteFile(path, []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestSourceCLIArtifactsHappyPath(t *testing.T) {
	restoreLook := cli.StubLookPath(func(string) (string, error) { return "/usr/bin/spec-kitty", nil })
	t.Cleanup(restoreLook)

	directiveListScript := writeFakeScript(t, `#!/bin/sh
echo '{"all_directives": [{"id": "DIRECTIVE_001", "source": "builtin"}]}'
`)
	profileListScript := writeFakeScript(t, `#!/bin/sh
echo '{"profiles": [{"id": "implementer-ivan", "source": "built-in"}]}'
`)
	directiveContentScript := writeFakeScript(t, `#!/bin/sh
printf 'Full artifact:\n{"id": "DIRECTIVE_001", "title": "Example Directive"}\n'
`)
	profileContentScript := writeFakeScript(t, `#!/bin/sh
printf 'Full artifact:\n{"id": "implementer-ivan", "name": "Implementer Ivan"}\n'
`)

	restoreCmd := cli.StubCommandFactory(func(_ string, args ...string) *exec.Cmd {
		joined := strings.Join(args, " ")
		switch {
		case strings.Contains(joined, "profiles list"):
			return exec.Command(profileListScript)
		case strings.Contains(joined, "--include agent-profile:"):
			return exec.Command(profileContentScript)
		case strings.Contains(joined, "--include directive:"):
			return exec.Command(directiveContentScript)
		default:
			return exec.Command(directiveListScript)
		}
	})
	t.Cleanup(restoreCmd)

	artifacts := SourceCLIArtifacts()
	if len(artifacts) != 2 {
		t.Fatalf("want 2 artifacts, got %d: %#v", len(artifacts), artifacts)
	}

	var gotDirective, gotProfile bool
	for _, a := range artifacts {
		switch a.ArtifactType {
		case pack.ArtifactDirective:
			gotDirective = true
			if a.ArtifactID != "DIRECTIVE_001" || a.Name != "Example Directive" || !a.ParseOK {
				t.Errorf("unexpected directive artifact: %#v", a)
			}
			if a.SourceRelativePath != "builtin://directive/DIRECTIVE_001" {
				t.Errorf("unexpected source path: %s", a.SourceRelativePath)
			}
			if a.Content["title"] != "Example Directive" {
				t.Errorf("unexpected content: %#v", a.Content)
			}
		case pack.ArtifactProfile:
			gotProfile = true
			if a.ArtifactID != "implementer-ivan" || a.Name != "Implementer Ivan" || !a.ParseOK {
				t.Errorf("unexpected profile artifact: %#v", a)
			}
			if a.SourceRelativePath != "builtin://profile/implementer-ivan" {
				t.Errorf("unexpected source path: %s", a.SourceRelativePath)
			}
		default:
			t.Errorf("unexpected artifact type: %v", a.ArtifactType)
		}
	}
	if !gotDirective || !gotProfile {
		t.Errorf("missing expected artifact types: directive=%v profile=%v", gotDirective, gotProfile)
	}
}

func TestSourceCLIArtifactsCLIMissingReturnsEmptyNoPanic(t *testing.T) {
	restoreLook := cli.StubLookPath(func(string) (string, error) { return "", errors.New("not found") })
	t.Cleanup(restoreLook)

	artifacts := SourceCLIArtifacts()
	if len(artifacts) != 0 {
		t.Fatalf("want zero artifacts, got %#v", artifacts)
	}
}

func TestSourceCLIArtifactsSkipsUnfetchableIDs(t *testing.T) {
	restoreLook := cli.StubLookPath(func(string) (string, error) { return "/usr/bin/spec-kitty", nil })
	t.Cleanup(restoreLook)

	directiveListScript := writeFakeScript(t, `#!/bin/sh
echo '{"all_directives": [{"id": "DIRECTIVE_001", "source": "builtin"}, {"id": "DIRECTIVE_002", "source": "builtin"}]}'
`)
	emptyProfileListScript := writeFakeScript(t, `#!/bin/sh
echo '{"profiles": []}'
`)
	// DIRECTIVE_001's content fetch succeeds; DIRECTIVE_002's has no "Full
	// artifact:" marker and must be silently skipped, not error out.
	directiveContentScript := writeFakeScript(t, `#!/bin/sh
case "$*" in
  *DIRECTIVE_001*) printf 'Full artifact:\n{"id": "DIRECTIVE_001", "title": "One"}\n' ;;
  *) echo 'no marker for this one' ;;
esac
`)

	restoreCmd := cli.StubCommandFactory(func(_ string, args ...string) *exec.Cmd {
		joined := strings.Join(args, " ")
		switch {
		case strings.Contains(joined, "profiles list"):
			return exec.Command(emptyProfileListScript)
		case strings.Contains(joined, "--include directive:"):
			return exec.Command(directiveContentScript, args...)
		default:
			return exec.Command(directiveListScript)
		}
	})
	t.Cleanup(restoreCmd)

	artifacts := SourceCLIArtifacts()
	if len(artifacts) != 1 {
		t.Fatalf("want 1 artifact (DIRECTIVE_002 skipped), got %d: %#v", len(artifacts), artifacts)
	}
	if artifacts[0].ArtifactID != "DIRECTIVE_001" {
		t.Errorf("want DIRECTIVE_001, got %s", artifacts[0].ArtifactID)
	}
}
