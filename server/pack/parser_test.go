package pack

import (
	"path/filepath"
	"testing"
)

func TestParseAllToleratesBadYAML(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "good.directive.yaml"), "id: GOOD\ntitle: Good One\ncategory: core\n")
	mustWrite(t, filepath.Join(root, "bad.directive.yaml"), "id: [unterminated\n")

	files, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	arts, err := ParseAll(root, files)
	if err != nil {
		t.Fatal(err)
	}
	if len(arts) != 2 {
		t.Fatalf("want 2 artifacts, got %d", len(arts))
	}

	var good, bad *ParsedArtifact
	for i := range arts {
		switch arts[i].SourceRelativePath {
		case "good.directive.yaml":
			good = &arts[i]
		case "bad.directive.yaml":
			bad = &arts[i]
		}
	}
	if good == nil || bad == nil {
		t.Fatalf("missing results: %#v", arts)
	}
	if !good.ParseOK || good.ArtifactID != "GOOD" || good.Name != "Good One" || good.Category != "core" {
		t.Errorf("good parse unexpected: %#v", good)
	}
	if bad.ParseOK || bad.ParseError == "" {
		t.Errorf("bad should fail parse: %#v", bad)
	}
	if bad.Content["path"] != "bad.directive.yaml" {
		t.Errorf("stub content path: %#v", bad.Content)
	}
}

func TestParseProfileFields(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "ivan.agent.yaml"), `
profile-id: implementer-ivan
name: Implementer Ivan
roles:
  - implementer
specialization-context:
  domain-keywords:
    - implementation
    - test
`)
	files, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	arts, err := ParseAll(root, files)
	if err != nil {
		t.Fatal(err)
	}
	if len(arts) != 1 {
		t.Fatalf("want 1, got %d", len(arts))
	}
	a := arts[0]
	if a.ArtifactID != "implementer-ivan" || a.Name != "Implementer Ivan" {
		t.Errorf("ids: %#v", a)
	}
	if len(a.Roles) != 1 || a.Roles[0] != "implementer" {
		t.Errorf("roles: %#v", a.Roles)
	}
	if len(a.DomainKeywords) != 2 {
		t.Errorf("keywords: %#v", a.DomainKeywords)
	}
}
