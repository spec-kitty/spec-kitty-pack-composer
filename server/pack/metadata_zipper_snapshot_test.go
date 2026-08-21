package pack

import (
	"archive/zip"
	"bytes"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractMetadata(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, ".pack-version"), "1.2.3\n")
	mustWrite(t, filepath.Join(root, "org-charter.yaml"), "schema_version: \"1\"\norg_name: acme-pack\n")
	mustWrite(t, filepath.Join(root, "README.md"), `# My Pack

Short description here.

See [Docs](https://example.com/docs) for more.
`)
	meta, err := ExtractMetadata(root)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Name != "My Pack" || meta.Version != "1.2.3" {
		t.Errorf("meta: %#v", meta)
	}
	if meta.ProjectKey != "acme-pack" {
		t.Errorf("project_key: %q", meta.ProjectKey)
	}
	if meta.Description != "Short description here." {
		t.Errorf("desc: %q", meta.Description)
	}
	if len(meta.Links) != 1 || meta.Links[0].Label != "Docs" || meta.Links[0].URL != "https://example.com/docs" {
		t.Errorf("links: %#v", meta.Links)
	}
}

func TestExtractMetadataProjectKeyFromPackSubdir(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "pack", "org-charter.yaml"), "org_name: acme-example-pack\n")
	mustWrite(t, filepath.Join(root, "pack", ".pack-version"), "1.0.0\n")
	mustWrite(t, filepath.Join(root, "README.md"), "# Title\n\nBody.\n")
	meta, err := ExtractMetadata(root)
	if err != nil {
		t.Fatal(err)
	}
	if meta.ProjectKey != "acme-example-pack" {
		t.Errorf("project_key: %q", meta.ProjectKey)
	}
	if meta.Version != "1.0.0" {
		t.Errorf("version: %q", meta.Version)
	}
}

func TestExtractMetadataParentID(t *testing.T) {
	tests := []struct {
		name         string
		writeCharter func(t *testing.T, root string)
		wantParentID string
	}{
		{
			name: "extends at pack root",
			writeCharter: func(t *testing.T, root string) {
				mustWrite(t, filepath.Join(root, "org-charter.yaml"), "org_name: acme\nextends: acme-parent\n")
			},
			wantParentID: "acme-parent",
		},
		{
			name: "org_name only, no extends",
			writeCharter: func(t *testing.T, root string) {
				mustWrite(t, filepath.Join(root, "org-charter.yaml"), "org_name: acme\n")
			},
			wantParentID: "",
		},
		{
			name:         "no org-charter.yaml at all",
			writeCharter: func(t *testing.T, root string) {},
			wantParentID: "",
		},
		{
			name: "extends in pack subdirectory",
			writeCharter: func(t *testing.T, root string) {
				mustWrite(t, filepath.Join(root, "pack", "org-charter.yaml"), "org_name: acme\nextends: sub-parent\n")
			},
			wantParentID: "sub-parent",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			tt.writeCharter(t, root)
			meta, err := ExtractMetadata(root)
			if err != nil {
				t.Fatal(err)
			}
			if meta.ParentID != tt.wantParentID {
				t.Errorf("ParentID = %q, want %q", meta.ParentID, tt.wantParentID)
			}
		})
	}
}

func TestExtractMetadataStripsHTMLComments(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "README.md"), `<!--
+----------------------------------------------------+
| banner art that must not become the description    |
+----------------------------------------------------+
-->

# My Doctrine Pack

<!-- Target persona: maintainers only. -->

Real pack description for humans.

See [Docs](https://example.com/docs) and <!-- skip [Hidden](https://evil.example) --> more.
`)
	meta, err := ExtractMetadata(root)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Name != "My Doctrine Pack" {
		t.Errorf("name: %q", meta.Name)
	}
	if meta.Description != "Real pack description for humans." {
		t.Errorf("desc: %q", meta.Description)
	}
	if strings.Contains(meta.Description, "banner") || strings.Contains(meta.Description, "Target persona") {
		t.Errorf("description still contains comment text: %q", meta.Description)
	}
	if len(meta.Links) != 1 || meta.Links[0].Label != "Docs" {
		t.Errorf("links should ignore commented URLs: %#v", meta.Links)
	}
}

func TestExtractMetadataFallbackName(t *testing.T) {
	root := t.TempDir()
	meta, err := ExtractMetadata(root)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Name != filepath.Base(root) {
		t.Errorf("fallback name got %q", meta.Name)
	}
}

func TestZipPackRelativePaths(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "a.directive.yaml"), "id: A\n")
	mustWrite(t, filepath.Join(root, "nested", "b.txt"), "hi\n")
	mustWrite(t, filepath.Join(root, ".DS_Store"), "junk")

	data, err := ZipPack(root)
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range zr.File {
		names[f.Name] = true
	}
	if !names["a.directive.yaml"] || !names["nested/b.txt"] {
		t.Errorf("zip contents: %#v", names)
	}
	if names[".DS_Store"] {
		t.Error("expected .DS_Store excluded")
	}
}

func TestBuildStatsAndSnapshot(t *testing.T) {
	arts := []ParsedArtifact{
		{ArtifactType: ArtifactDirective, ArtifactID: "d1", Name: "D1", ParseOK: true, Content: map[string]any{"id": "d1"}},
		{ArtifactType: ArtifactDirective, ArtifactID: "d2", Name: "D2", ParseOK: false, ParseError: "boom", Content: map[string]any{"path": "x", "error": "boom"}, SourceRelativePath: "x"},
		{ArtifactType: ArtifactProfile, ArtifactID: "p", Name: "P", ParseOK: true, Roles: []string{"r"}, Content: map[string]any{}},
	}
	stats := BuildStats(arts)
	if stats.Total != 3 || stats.ByType["directive"] != 2 || stats.ByType["profile"] != 1 {
		t.Errorf("stats: %#v", stats)
	}
	snap := BuildRawSnapshot(PackMetadata{Name: "N", Version: "1"}, arts)
	if snap["name"] != "N" {
		t.Errorf("snap: %#v", snap)
	}
	list, ok := snap["artifacts"].([]map[string]any)
	if !ok || len(list) != 3 {
		t.Errorf("artifacts: %#v", snap["artifacts"])
	}
}
