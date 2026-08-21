package charter

import (
	"archive/zip"
	"bytes"
	"testing"

	"gopkg.in/yaml.v3"
)

// buildTestBundleZip constructs an in-memory zip with the given entries
// (path -> content), mirroring WP06's .kittify/charter/ export layout.
func buildTestBundleZip(t *testing.T, entries map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, content := range entries {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close zip: %v", err)
	}
	return buf.Bytes()
}

func validBundleEntries() map[string]string {
	return map[string]string{
		bundleCharterMDPath:                "# My Charter\n\nSome content.\n",
		bundleGovernanceYAMLPath:           "doctrine:\n  selected_directives:\n  - D1\n",
		".kittify/charter/directives.yaml": "directives: []\n",
		".kittify/charter/metadata.yaml":   "bundle_schema_version: 2\n",
	}
}

func TestValidateBundleStructure_RejectsNonZip(t *testing.T) {
	_, err := ValidateBundleStructure([]byte("this is definitely not a zip file"))
	if err == nil {
		t.Fatal("expected error for non-zip input, got nil")
	}
}

func TestValidateBundleStructure_RejectsMissingGovernanceYAML(t *testing.T) {
	entries := validBundleEntries()
	delete(entries, bundleGovernanceYAMLPath)
	zipBytes := buildTestBundleZip(t, entries)

	_, err := ValidateBundleStructure(zipBytes)
	if err == nil {
		t.Fatal("expected error for missing governance.yaml, got nil")
	}
}

func TestValidateBundleStructure_RejectsMissingCharterMD(t *testing.T) {
	entries := validBundleEntries()
	delete(entries, bundleCharterMDPath)
	zipBytes := buildTestBundleZip(t, entries)

	_, err := ValidateBundleStructure(zipBytes)
	if err == nil {
		t.Fatal("expected error for missing charter.md, got nil")
	}
}

func TestValidateBundleStructure_AcceptsValidBundle(t *testing.T) {
	zipBytes := buildTestBundleZip(t, validBundleEntries())

	parsed, err := ValidateBundleStructure(zipBytes)
	if err != nil {
		t.Fatalf("expected valid bundle to pass structural validation, got: %v", err)
	}
	if len(parsed.CharterMD) == 0 {
		t.Fatal("expected non-empty CharterMD")
	}
	if len(parsed.GovernanceYAML) == 0 {
		t.Fatal("expected non-empty GovernanceYAML")
	}
}

// buildGovernanceYAMLForTest hand-constructs a governance.yaml matching the
// documented doctrine: schema (WP05's research.md R4/R5 mapping table),
// since WP05's real BuildGovernanceYAML has not landed in this lane at
// implementation time. Field names/order here MUST match WP05's builder
// exactly once it lands (see bundle_import.go's governanceDoctrineDoc doc
// comment).
func buildGovernanceYAMLForTest(t *testing.T, selections map[string][]string) []byte {
	t.Helper()
	doc := map[string]any{
		"doctrine": map[string]any{
			"selected_directives":             selections[ArtifactTypeDirective],
			"selected_tactics":                selections[ArtifactTypeTactic],
			"selected_procedures":             selections[ArtifactTypeProcedure],
			"selected_styleguides":            selections[ArtifactTypeStyleguide],
			"selected_toolguides":             selections[ArtifactTypeToolguide],
			"selected_agent_profiles":         selections[ArtifactTypeProfile],
			"selected_mission_step_contracts": selections[ArtifactTypeMissionStepContract],
			"selected_templates":              selections[ArtifactTypeTemplate],
			"selected_glossary":               selections[ArtifactTypeGlossary],
		},
	}
	out, err := yaml.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal governance.yaml fixture: %v", err)
	}
	return out
}

func TestParseGovernanceSelections_RoundTripsWP05Mapping(t *testing.T) {
	want := map[string][]string{
		ArtifactTypeDirective:           {"DIRECTIVE_001", "DIRECTIVE_002"},
		ArtifactTypeTactic:              {"TACTIC_A"},
		ArtifactTypeProcedure:           {"PROC_A"},
		ArtifactTypeStyleguide:          {"STYLE_A"},
		ArtifactTypeToolguide:           {"TOOL_A"},
		ArtifactTypeProfile:             {"PROFILE_A"},
		ArtifactTypeMissionStepContract: {"CONTRACT_A"},
		ArtifactTypeTemplate:            {"TEMPLATE_A"},
		ArtifactTypeGlossary:            {"GLOSSARY_A"},
	}

	governanceYAML := buildGovernanceYAMLForTest(t, want)

	got, err := ParseGovernanceSelections(governanceYAML)
	if err != nil {
		t.Fatalf("ParseGovernanceSelections: %v", err)
	}

	for kind, ids := range want {
		gotIDs := got[kind]
		if len(gotIDs) != len(ids) {
			t.Fatalf("kind %s: got %v, want %v", kind, gotIDs, ids)
		}
		for i := range ids {
			if gotIDs[i] != ids[i] {
				t.Fatalf("kind %s: got %v, want %v", kind, gotIDs, ids)
			}
		}
	}
}

func TestParseGovernanceSelections_MissingKeyParsesAsEmptyList(t *testing.T) {
	// Hand-edited/older-format governance.yaml missing several of the 9 keys
	// entirely (C-005) — must parse successfully, not error.
	governanceYAML := []byte("doctrine:\n  selected_directives:\n  - DIRECTIVE_001\n")

	got, err := ParseGovernanceSelections(governanceYAML)
	if err != nil {
		t.Fatalf("expected no error for partial governance.yaml, got: %v", err)
	}
	if len(got[ArtifactTypeDirective]) != 1 || got[ArtifactTypeDirective][0] != "DIRECTIVE_001" {
		t.Fatalf("got directives=%v, want [DIRECTIVE_001]", got[ArtifactTypeDirective])
	}
	for _, kind := range DoctrineArtifactTypeOrder {
		if kind == ArtifactTypeDirective {
			continue
		}
		if len(got[kind]) != 0 {
			t.Fatalf("kind %s: expected empty list for missing key, got %v", kind, got[kind])
		}
	}
}

func TestResolveImportedItems_FlagsUnmatchedAsMissingSource(t *testing.T) {
	selections := map[string][]string{
		ArtifactTypeDirective: {"KNOWN", "UNKNOWN"},
	}
	known := []KnownArtifact{
		{PackArtifactID: "pa1", ArtifactType: ArtifactTypeDirective, ArtifactID: "KNOWN", ArtifactName: "Known Directive", PackID: "p1", PackName: "Pack A"},
	}

	items := ResolveImportedItems(selections, known)
	if len(items) != 2 {
		t.Fatalf("expected 2 items (1 matched + 1 missing-source), got %d: %+v", len(items), items)
	}

	byID := map[string]ImportedItem{}
	for _, it := range items {
		byID[it.ArtifactID] = it
	}

	matched, ok := byID["KNOWN"]
	if !ok || !matched.Matched {
		t.Fatalf("expected KNOWN to be matched, got %+v", matched)
	}
	if matched.PackArtifactID != "pa1" || matched.PackName != "Pack A" {
		t.Fatalf("matched item missing pack info: %+v", matched)
	}
	if !matched.Enabled {
		t.Fatalf("expected sole match to be enabled, got %+v", matched)
	}

	unmatched, ok := byID["UNKNOWN"]
	if !ok {
		t.Fatal("expected UNKNOWN reference to still be present, not dropped")
	}
	if unmatched.Matched {
		t.Fatalf("expected UNKNOWN to be unmatched, got %+v", unmatched)
	}
	if unmatched.PackArtifactID != "" || unmatched.PackName != "" {
		t.Fatalf("expected unmatched item to carry no pack info, got %+v", unmatched)
	}
}

func TestResolveImportedItems_TwoConflictingMatchesInsertOneDisabled(t *testing.T) {
	selections := map[string][]string{
		ArtifactTypeDirective: {"DUP"},
	}
	known := []KnownArtifact{
		{PackArtifactID: "pa-b", ArtifactType: ArtifactTypeDirective, ArtifactID: "DUP", ArtifactName: "Dup", PackID: "pb", PackName: "Pack B"},
		{PackArtifactID: "pa-a", ArtifactType: ArtifactTypeDirective, ArtifactID: "DUP", ArtifactName: "Dup", PackID: "pa", PackName: "Pack A"},
	}

	items := ResolveImportedItems(selections, known)
	if len(items) != 2 {
		t.Fatalf("expected 2 items for a same-identity conflict across 2 packs, got %d: %+v", len(items), items)
	}

	enabledCount := 0
	for _, it := range items {
		if !it.Matched {
			t.Fatalf("expected both conflicting items to be matched, got %+v", it)
		}
		if it.Enabled {
			enabledCount++
		}
	}
	if enabledCount != 1 {
		t.Fatalf("expected exactly 1 of the 2 conflicting items to be enabled, got %d enabled: %+v", enabledCount, items)
	}

	// Deterministic: alphabetically-first pack name (Pack A) is the enabled one.
	if items[0].PackName != "Pack A" || !items[0].Enabled {
		t.Fatalf("expected Pack A (alphabetically first) to be the enabled item, got %+v", items[0])
	}
	if items[1].PackName != "Pack B" || items[1].Enabled {
		t.Fatalf("expected Pack B to be the disabled item, got %+v", items[1])
	}
}

func TestResolveImportedItems_NoSelectionsReturnsEmpty(t *testing.T) {
	items := ResolveImportedItems(map[string][]string{}, []KnownArtifact{
		{PackArtifactID: "pa1", ArtifactType: ArtifactTypeDirective, ArtifactID: "A", PackName: "Pack A"},
	})
	if len(items) != 0 {
		t.Fatalf("expected no items when selections is empty, got %+v", items)
	}
}
