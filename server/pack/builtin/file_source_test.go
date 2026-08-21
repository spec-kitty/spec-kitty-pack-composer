package builtin

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/spec-kitty/pack-composer/server/pack"
)

func mustMkdirAll(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
}

func mustWriteFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func TestScanBuiltinSubdir_RecognizedFiles(t *testing.T) {
	root := t.TempDir()
	subdir := filepath.Join(root, "tactics", "built-in")
	mustMkdirAll(t, subdir)
	mustWriteFile(t, filepath.Join(subdir, "foo.tactic.yaml"), "id: foo\ntitle: Foo Tactic\n")
	mustWriteFile(t, filepath.Join(subdir, "bar.tactic.yaml"), "id: bar\ntitle: Bar Tactic\n")

	artifacts, err := scanBuiltinSubdir(root, "tactics/built-in")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(artifacts) != 2 {
		t.Fatalf("got %d artifacts, want 2", len(artifacts))
	}
	for _, a := range artifacts {
		if a.ArtifactType != pack.ArtifactTactic {
			t.Errorf("got artifact type %q, want %q", a.ArtifactType, pack.ArtifactTactic)
		}
		if !a.ParseOK {
			t.Errorf("expected ParseOK=true for %s, got false (err=%s)", a.SourceRelativePath, a.ParseError)
		}
		wantPrefix := "tactics/built-in/"
		if len(a.SourceRelativePath) < len(wantPrefix) || a.SourceRelativePath[:len(wantPrefix)] != wantPrefix {
			t.Errorf("SourceRelativePath %q missing prefix %q", a.SourceRelativePath, wantPrefix)
		}
	}
}

func TestScanBuiltinSubdir_MissingDir(t *testing.T) {
	root := t.TempDir()

	artifacts, err := scanBuiltinSubdir(root, "tactics/built-in")
	if err != nil {
		t.Fatalf("expected nil error for missing subdir, got %v", err)
	}
	if artifacts != nil {
		t.Fatalf("expected nil artifacts for missing subdir, got %v", artifacts)
	}
}

// buildFullFixtureTree creates a doctrine-dir-shaped tree with all five
// known subdirs populated with one recognized file each.
func buildFullFixtureTree(t *testing.T) string {
	t.Helper()
	root := t.TempDir()

	type entry struct {
		relDir   string
		filename string
		content  string
	}
	entries := []entry{
		{"tactics/built-in", "sample.tactic.yaml", "id: sample-tactic\n"},
		{"procedures/built-in", "sample.procedure.yaml", "id: sample-procedure\n"},
		{"styleguides/built-in", "sample.styleguide.yaml", "id: sample-styleguide\n"},
		{"toolguides/built-in", "sample.toolguide.yaml", "id: sample-toolguide\n"},
		{"missions/built_in_step_contracts", "sample.step-contract.yaml", "id: sample-step-contract\n"},
	}
	for _, e := range entries {
		dir := filepath.Join(root, filepath.FromSlash(e.relDir))
		mustMkdirAll(t, dir)
		mustWriteFile(t, filepath.Join(dir, e.filename), e.content)
	}
	return root
}

func TestSourceFileScanArtifacts_FullFixtureTree(t *testing.T) {
	root := buildFullFixtureTree(t)

	restore := StubResolveDoctrineDirFn(func() (string, error) {
		return root, nil
	})
	defer restore()

	artifacts := SourceFileScanArtifacts()
	if len(artifacts) != 5 {
		t.Fatalf("got %d artifacts, want 5", len(artifacts))
	}

	seenTypes := map[pack.ArtifactType]bool{}
	for _, a := range artifacts {
		seenTypes[a.ArtifactType] = true
	}
	wantTypes := []pack.ArtifactType{
		pack.ArtifactTactic,
		pack.ArtifactProcedure,
		pack.ArtifactStyleguide,
		pack.ArtifactToolguide,
		pack.ArtifactMissionStepContract,
	}
	for _, wt := range wantTypes {
		if !seenTypes[wt] {
			t.Errorf("expected an artifact of type %q, none found", wt)
		}
	}
}

func TestSourceFileScanArtifacts_ResolveDoctrineDirFails(t *testing.T) {
	restore := StubResolveDoctrineDirFn(func() (string, error) {
		return "", errors.New("spec-kitty not installed")
	})
	defer restore()

	artifacts := SourceFileScanArtifacts()
	if artifacts != nil {
		t.Fatalf("expected nil artifacts on resolution failure, got %v", artifacts)
	}
}

func TestSourceFileScanArtifacts_MissingSubdirsSkippedGracefully(t *testing.T) {
	root := t.TempDir()
	// Only one of the five known subdirs is present.
	subdir := filepath.Join(root, "tactics", "built-in")
	mustMkdirAll(t, subdir)
	mustWriteFile(t, filepath.Join(subdir, "only.tactic.yaml"), "id: only\n")

	restore := StubResolveDoctrineDirFn(func() (string, error) {
		return root, nil
	})
	defer restore()

	artifacts := SourceFileScanArtifacts()
	if len(artifacts) != 1 {
		t.Fatalf("got %d artifacts, want 1", len(artifacts))
	}
}
