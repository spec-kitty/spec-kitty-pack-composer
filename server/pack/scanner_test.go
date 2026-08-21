package pack

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanRecognizesConventions(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "directive", "a.directive.yaml"), "id: A\ntitle: Dir\n")
	mustWrite(t, filepath.Join(root, "t.tactic.yaml"), "id: T\n")
	mustWrite(t, filepath.Join(root, "templates", "hello.md"), "# Hello\n")
	mustWrite(t, filepath.Join(root, "glossary", "terms.yaml"), "term: foo\n")
	mustWrite(t, filepath.Join(root, "noise.txt"), "ignore\n")
	mustWrite(t, filepath.Join(root, ".DS_Store"), "x")
	mustWrite(t, filepath.Join(root, "p.agent.yaml"), "profile-id: p\nname: P\n")
	mustWrite(t, filepath.Join(root, "s.step-contract.yaml"), "id: s\n")

	files, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]ArtifactType{}
	for _, f := range files {
		got[f.RelativePath] = f.ArtifactType
	}
	want := map[string]ArtifactType{
		"directive/a.directive.yaml": ArtifactDirective,
		"t.tactic.yaml":              ArtifactTactic,
		"templates/hello.md":         ArtifactTemplate,
		"glossary/terms.yaml":        ArtifactGlossary,
		"p.agent.yaml":               ArtifactProfile,
		"s.step-contract.yaml":       ArtifactMissionStepContract,
	}
	if len(got) != len(want) {
		t.Fatalf("got %d files %#v, want %d", len(got), got, len(want))
	}
	for path, typ := range want {
		if got[path] != typ {
			t.Errorf("%s: got %s want %s", path, got[path], typ)
		}
	}
}

func TestScanEmptyPack(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "README.md"), "# Empty\n")
	files, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 0 {
		t.Fatalf("expected empty scan, got %#v", files)
	}
}

func mustWrite(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}
