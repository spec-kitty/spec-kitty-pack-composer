package charter

import (
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

// oneItemPerKind returns one BundleItem for each of the 9 pack_artifacts
// artifact_type kinds, so callers can assert every doctrine.selected_<kind>
// field is populated.
func oneItemPerKind() []BundleItem {
	items := make([]BundleItem, 0, len(kindOrder))
	for _, kind := range kindOrder {
		items = append(items, BundleItem{
			ArtifactType: kind,
			ArtifactID:   kind + "_ID",
			ArtifactName: kind + " name",
		})
	}
	return items
}

func TestBuildGovernanceYAML_UsesRealFieldNames(t *testing.T) {
	out, err := BuildGovernanceYAML(oneItemPerKind())
	if err != nil {
		t.Fatalf("BuildGovernanceYAML returned error: %v", err)
	}

	var parsed map[string]any
	if err := yaml.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("output did not parse as YAML: %v", err)
	}

	doctrine, ok := parsed["doctrine"].(map[string]any)
	if !ok {
		t.Fatalf("doctrine key missing or not a map, got %T", parsed["doctrine"])
	}

	wantFields := map[string]string{
		"directive":             "selected_directives",
		"tactic":                "selected_tactics",
		"procedure":             "selected_procedures",
		"styleguide":            "selected_styleguides",
		"toolguide":             "selected_toolguides",
		"profile":               "selected_agent_profiles",
		"mission_step_contract": "selected_mission_step_contracts",
		"template":              "selected_templates",
		"glossary":              "selected_glossary",
	}

	for kind, field := range wantFields {
		raw, present := doctrine[field]
		if !present {
			t.Errorf("doctrine.%s (for kind %q) missing from governance.yaml", field, kind)
			continue
		}
		list, ok := raw.([]any)
		if !ok || len(list) != 1 {
			t.Errorf("doctrine.%s = %#v, want a single-element list", field, raw)
			continue
		}
		if got := list[0]; got != kind+"_ID" {
			t.Errorf("doctrine.%s = %v, want [%q]", field, got, kind+"_ID")
		}
	}

	// Specifically re-assert the one field the WP prompt calls out as the
	// easiest to get wrong by guessing: it must be selected_agent_profiles,
	// never selected_profiles.
	if _, present := doctrine["selected_profiles"]; present {
		t.Errorf("doctrine.selected_profiles present — the real field name is selected_agent_profiles")
	}
}

func TestBuildGovernanceYAML_EmptyKindProducesEmptyList(t *testing.T) {
	// Only a directive item is enabled; every other kind must still emit
	// its key with an empty list, not an omitted key.
	items := []BundleItem{{ArtifactType: "directive", ArtifactID: "DIRECTIVE_001", ArtifactName: "Directive One"}}

	out, err := BuildGovernanceYAML(items)
	if err != nil {
		t.Fatalf("BuildGovernanceYAML returned error: %v", err)
	}

	var parsed map[string]any
	if err := yaml.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("output did not parse as YAML: %v", err)
	}
	doctrine := parsed["doctrine"].(map[string]any)

	raw, present := doctrine["selected_tactics"]
	if !present {
		t.Fatalf("doctrine.selected_tactics key missing entirely, want present with an empty list")
	}
	list, ok := raw.([]any)
	if !ok || len(list) != 0 {
		t.Errorf("doctrine.selected_tactics = %#v, want an empty list", raw)
	}
}

func TestBuildMetadataYAML_AlwaysSetsBundleSchemaVersion2(t *testing.T) {
	now := time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC)
	out, err := BuildMetadataYAML([]byte("# Test Charter\n"), 3, now)
	if err != nil {
		t.Fatalf("BuildMetadataYAML returned error: %v", err)
	}

	var parsed map[string]any
	if err := yaml.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("output did not parse as YAML: %v", err)
	}

	raw, present := parsed["bundle_schema_version"]
	if !present {
		t.Fatalf("bundle_schema_version key missing from metadata.yaml")
	}
	got, ok := raw.(int)
	if !ok {
		t.Fatalf("bundle_schema_version has Go type %T after YAML unmarshal, want int (regression risk: emitting it as a string breaks spec-kitty's get_bundle_schema_version)", raw)
	}
	if got != 2 {
		t.Errorf("bundle_schema_version = %d, want 2", got)
	}

	// schema_version is a different, unrelated string field — make sure
	// it wasn't accidentally merged with bundle_schema_version.
	if sv, _ := parsed["schema_version"].(string); sv != "1.0.0" {
		t.Errorf("schema_version = %q, want \"1.0.0\"", sv)
	}
}

func TestBuildMetadataYAML_CharterHashChangesWithContent(t *testing.T) {
	now := time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC)

	outA, err := BuildMetadataYAML([]byte("# Charter A\n"), 1, now)
	if err != nil {
		t.Fatalf("BuildMetadataYAML returned error: %v", err)
	}
	outB, err := BuildMetadataYAML([]byte("# Charter B\n"), 1, now)
	if err != nil {
		t.Fatalf("BuildMetadataYAML returned error: %v", err)
	}
	outARepeat, err := BuildMetadataYAML([]byte("# Charter A\n"), 1, now)
	if err != nil {
		t.Fatalf("BuildMetadataYAML returned error: %v", err)
	}

	var parsedA, parsedB, parsedARepeat map[string]any
	_ = yaml.Unmarshal(outA, &parsedA)
	_ = yaml.Unmarshal(outB, &parsedB)
	_ = yaml.Unmarshal(outARepeat, &parsedARepeat)

	if parsedA["charter_hash"] == parsedB["charter_hash"] {
		t.Errorf("charter_hash did not change when charter.md content changed")
	}
	if parsedA["charter_hash"] != parsedARepeat["charter_hash"] {
		t.Errorf("charter_hash is not stable for identical content: %v != %v", parsedA["charter_hash"], parsedARepeat["charter_hash"])
	}
}

func TestAssembleBundle_ZeroEnabledItems(t *testing.T) {
	now := time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC)
	bundle, err := AssembleBundle("Empty Charter", []BundleItem{}, now)
	if err != nil {
		t.Fatalf("AssembleBundle returned error for zero items: %v", err)
	}
	if bundle == nil {
		t.Fatalf("AssembleBundle returned nil bundle for zero items")
	}

	for name, content := range map[string][]byte{
		"CharterMD":      bundle.CharterMD,
		"GovernanceYAML": bundle.GovernanceYAML,
		"DirectivesYAML": bundle.DirectivesYAML,
		"MetadataYAML":   bundle.MetadataYAML,
	} {
		if len(content) == 0 {
			t.Errorf("bundle.%s is empty, want non-empty even with zero items", name)
		}
	}

	wantCharterMD := "# Empty Charter\n\n_No items are currently enabled in this charter._\n"
	if string(bundle.CharterMD) != wantCharterMD {
		t.Errorf("CharterMD = %q, want %q", bundle.CharterMD, wantCharterMD)
	}
}

func TestBuildDirectivesYAML_OnlyIncludesDirectiveKind(t *testing.T) {
	items := []BundleItem{
		{ArtifactType: "directive", ArtifactID: "DIRECTIVE_002", ArtifactName: "Second Directive"},
		{ArtifactType: "tactic", ArtifactID: "TACTIC_001", ArtifactName: "A Tactic"},
		{ArtifactType: "directive", ArtifactID: "DIRECTIVE_001", ArtifactName: "First Directive"},
		{ArtifactType: "profile", ArtifactID: "PROFILE_001", ArtifactName: "A Profile"},
	}

	out, err := BuildDirectivesYAML(items)
	if err != nil {
		t.Fatalf("BuildDirectivesYAML returned error: %v", err)
	}

	var parsed struct {
		Directives []map[string]any `yaml:"directives"`
	}
	if err := yaml.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("output did not parse as YAML: %v", err)
	}

	if len(parsed.Directives) != 2 {
		t.Fatalf("directives has %d entries, want 2 (non-directive kinds must be excluded)", len(parsed.Directives))
	}
	if parsed.Directives[0]["id"] != "DIRECTIVE_001" || parsed.Directives[1]["id"] != "DIRECTIVE_002" {
		t.Errorf("directives not sorted by id: got %v, %v", parsed.Directives[0]["id"], parsed.Directives[1]["id"])
	}
	for _, d := range parsed.Directives {
		if d["severity"] != "warn" {
			t.Errorf("directive %v severity = %v, want \"warn\"", d["id"], d["severity"])
		}
	}
}

func TestBuildCharterMarkdown_Deterministic(t *testing.T) {
	items := []BundleItem{
		{ArtifactType: "profile", ArtifactID: "PROFILE_002", ArtifactName: "Beta Profile"},
		{ArtifactType: "directive", ArtifactID: "DIRECTIVE_002", ArtifactName: "Second Directive"},
		{ArtifactType: "profile", ArtifactID: "PROFILE_001", ArtifactName: "Alpha Profile"},
		{ArtifactType: "directive", ArtifactID: "DIRECTIVE_001", ArtifactName: "First Directive"},
	}

	out1 := BuildCharterMarkdown("Deterministic Charter", items)
	out2 := BuildCharterMarkdown("Deterministic Charter", items)

	if string(out1) != string(out2) {
		t.Fatalf("BuildCharterMarkdown is not deterministic across repeated calls:\n---1---\n%s\n---2---\n%s", out1, out2)
	}

	// directive kind must precede profile kind (kindOrder), and within a
	// kind, items are sorted by ArtifactID.
	md := string(out1)
	directiveIdx := indexOf(md, "## Directives")
	profileIdx := indexOf(md, "## Agent Profiles")
	if directiveIdx == -1 || profileIdx == -1 {
		t.Fatalf("expected both kind sections present, got:\n%s", md)
	}
	if directiveIdx > profileIdx {
		t.Errorf("Directives section should precede Agent Profiles section per kindOrder")
	}
	if indexOf(md, "DIRECTIVE_001") > indexOf(md, "DIRECTIVE_002") {
		t.Errorf("directive items not sorted by ArtifactID")
	}
}

func TestBuildCharterMarkdown_ZeroItems(t *testing.T) {
	out := BuildCharterMarkdown("Empty Charter", nil)
	want := "# Empty Charter\n\n_No items are currently enabled in this charter._\n"
	if string(out) != want {
		t.Errorf("BuildCharterMarkdown(zero items) = %q, want %q", out, want)
	}
}

func indexOf(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
