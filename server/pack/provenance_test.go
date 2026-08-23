package pack

import (
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestScanNeverIngestsSidecarsAsArtifacts(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "a.directive.yaml"), "id: A\ntitle: Dir\n")
	// Both of these directories classify every file beneath them as an
	// artifact, so an unskipped sidecar would be ingested as content.
	mustWrite(t, filepath.Join(root, "glossary", "terms.yaml"), "term: foo\n")
	mustWrite(t, filepath.Join(root, "glossary", ProvenanceDirName, "terms.yaml"),
		"artifact_id: terms\nsource: synthesis\n")
	mustWrite(t, filepath.Join(root, "templates", "hello.md"), "# Hello\n")
	mustWrite(t, filepath.Join(root, "templates", ProvenanceDirName, "hello.yaml"),
		"artifact_id: hello\nsource: synthesis\n")
	mustWrite(t, filepath.Join(root, ProvenanceDirName, "A.yaml"),
		"artifact_id: A\nsource: retrospective\n")

	files, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		if containsPathSegment(f.RelativePath, ProvenanceDirName) {
			t.Fatalf("sidecar ingested as artifact: %s", f.RelativePath)
		}
	}
	if len(files) != 3 {
		t.Fatalf("want 3 artifacts, got %d: %+v", len(files), files)
	}
}

func TestAuthoredIsTheDefaultAndNotADefect(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "a.directive.yaml"), "id: DIRECTIVE_001\ntitle: Dir\n")

	arts := mustParseAll(t, root)
	if got := arts[0].Provenance.Status; got != ProvenanceAuthored {
		t.Fatalf("want %q, got %q", ProvenanceAuthored, got)
	}
	if arts[0].Provenance.SidecarRelativePath != "" {
		t.Fatal("authored artifact must not claim a sidecar")
	}
}

func TestDeclaredProvenanceIsReadFromTheSidecar(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "sub", "a.directive.yaml"),
		"id: DIRECTIVE_007\ntitle: Dir\n")
	mustWrite(t, filepath.Join(root, "sub", ProvenanceDirName, "DIRECTIVE_007.yaml"), `
schema_version: "2"
artifact_id: DIRECTIVE_007
source: retrospective
source_mission_id: mission-42
source_input_ids:
  - urn:doc:one
  - urn:doc:two
produced_at: "2026-08-01T00:00:00Z"
synthesizer_version: 1.4.0
corpus_snapshot_id: snap-9
re_applied: true
`)

	arts := mustParseAll(t, root)
	p := arts[0].Provenance

	if p.Status != ProvenanceDeclared {
		t.Fatalf("want %q, got %q", ProvenanceDeclared, p.Status)
	}
	if p.Source != "retrospective" || p.SourceMissionID != "mission-42" {
		t.Fatalf("sidecar fields not carried: %+v", p)
	}
	if len(p.SourceInputIDs) != 2 || p.SourceInputIDs[0] != "urn:doc:one" {
		t.Fatalf("source_input_ids not carried: %+v", p.SourceInputIDs)
	}
	if p.SchemaVersion != "2" || p.CorpusSnapshotID != "snap-9" {
		t.Fatalf("schema fields not carried: %+v", p)
	}
	if p.SidecarRelativePath != "sub/"+ProvenanceDirName+"/DIRECTIVE_007.yaml" {
		t.Fatalf("unexpected sidecar path: %q", p.SidecarRelativePath)
	}
	// Unknown keys survive so an upstream schema bump does not lose data.
	if p.Extra["re_applied"] != true {
		t.Fatalf("unknown keys dropped: %+v", p.Extra)
	}
}

func TestSidecarsAreMatchedOnBodyIDNotFilename(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "a.directive.yaml"),
		"id: 'urn:spec-kitty:directive/007'\ntitle: Dir\n")
	// The writer sanitizes ids that are unsafe as path components, so the
	// filename cannot be assumed to equal the id.
	mustWrite(t, filepath.Join(root, ProvenanceDirName, "urn_spec-kitty_directive_007-abc123def456.yaml"),
		"artifact_id: 'urn:spec-kitty:directive/007'\nsource: synthesis\n")

	arts := mustParseAll(t, root)
	if got := arts[0].Provenance.Status; got != ProvenanceDeclared {
		t.Fatalf("sanitized filename not matched on body id: got %q", got)
	}
}

func TestDerivationClaimWithoutSidecarIsUndeclared(t *testing.T) {
	for _, key := range derivationKeys {
		root := t.TempDir()
		mustWrite(t, filepath.Join(root, "a.directive.yaml"),
			"id: DIRECTIVE_001\ntitle: Dir\n"+key+": some/upstream/doc.md\n")

		arts := mustParseAll(t, root)
		if got := arts[0].Provenance.Status; got != ProvenanceUndeclared {
			t.Fatalf("key %q: want %q, got %q", key, ProvenanceUndeclared, got)
		}
	}
}

func TestAnEmptyDerivationClaimIsNotADefect(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "a.directive.yaml"),
		"id: DIRECTIVE_001\ntitle: Dir\nderived_from: \"\"\n")

	arts := mustParseAll(t, root)
	if got := arts[0].Provenance.Status; got != ProvenanceAuthored {
		t.Fatalf("want %q for a blank claim, got %q", ProvenanceAuthored, got)
	}
}

func TestSidecarWinsOverADerivationClaim(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "a.directive.yaml"),
		"id: DIRECTIVE_001\ntitle: Dir\nderived_from: some/doc.md\n")
	mustWrite(t, filepath.Join(root, ProvenanceDirName, "DIRECTIVE_001.yaml"),
		"artifact_id: DIRECTIVE_001\nsource: synthesis\n")

	arts := mustParseAll(t, root)
	if got := arts[0].Provenance.Status; got != ProvenanceDeclared {
		t.Fatalf("want %q, got %q", ProvenanceDeclared, got)
	}
}

func TestAnUnattributableSidecarIsIgnored(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "a.directive.yaml"), "id: DIRECTIVE_001\ntitle: Dir\n")
	// No artifact_id in the body, so it cannot be attributed to anything.
	mustWrite(t, filepath.Join(root, ProvenanceDirName, "DIRECTIVE_001.yaml"),
		"source: synthesis\n")

	arts := mustParseAll(t, root)
	if got := arts[0].Provenance.Status; got != ProvenanceAuthored {
		t.Fatalf("want %q, got %q", ProvenanceAuthored, got)
	}
}

func TestMalformedSidecarDoesNotFailThePack(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "a.directive.yaml"), "id: DIRECTIVE_001\ntitle: Dir\n")
	mustWrite(t, filepath.Join(root, ProvenanceDirName, "DIRECTIVE_001.yaml"),
		"this: [is not: valid yaml\n")

	arts := mustParseAll(t, root)
	if len(arts) != 1 || !arts[0].ParseOK {
		t.Fatalf("artifact parse must survive a bad sidecar: %+v", arts)
	}
	if got := arts[0].Provenance.Status; got != ProvenanceAuthored {
		t.Fatalf("want %q, got %q", ProvenanceAuthored, got)
	}
}

func TestSidecarOnlyAppliesToItsOwnDirectory(t *testing.T) {
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "one", "a.directive.yaml"), "id: SHARED_ID\ntitle: One\n")
	mustWrite(t, filepath.Join(root, "two", "b.directive.yaml"), "id: SHARED_ID\ntitle: Two\n")
	mustWrite(t, filepath.Join(root, "one", ProvenanceDirName, "SHARED_ID.yaml"),
		"artifact_id: SHARED_ID\nsource: synthesis\n")

	arts := mustParseAll(t, root)
	byPath := map[string]ProvenanceStatus{}
	for _, a := range arts {
		byPath[a.SourceRelativePath] = a.Provenance.Status
	}
	if byPath["one/a.directive.yaml"] != ProvenanceDeclared {
		t.Fatalf("sidecar not applied in its own directory: %+v", byPath)
	}
	if byPath["two/b.directive.yaml"] != ProvenanceAuthored {
		t.Fatalf("sidecar leaked across directories: %+v", byPath)
	}
}

func mustParseAll(t *testing.T, root string) []ParsedArtifact {
	t.Helper()
	files, err := Scan(root)
	if err != nil {
		t.Fatal(err)
	}
	arts, err := ParseAll(root, files)
	if err != nil {
		t.Fatal(err)
	}
	if len(arts) == 0 {
		t.Fatal("no artifacts parsed")
	}
	return arts
}

func containsPathSegment(relSlash, segment string) bool {
	return slices.Contains(strings.Split(relSlash, "/"), segment)
}
