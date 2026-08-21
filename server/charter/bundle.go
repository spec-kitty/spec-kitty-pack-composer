package charter

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// specKittyBundleSchemaVersion matches spec-kitty's CURRENT_BUNDLE_SCHEMA_VERSION
// (src/doctrine/versioning.py) — verified 2026-08-17. metadata.yaml MUST emit
// this as a YAML integer under the bundle_schema_version key, or
// `spec-kitty charter bundle validate` reports passed: false, exit code 1,
// even though every other field is well-formed.
const specKittyBundleSchemaVersion = 2

// kindOrder is the fixed, deterministic iteration order over
// pack_artifacts.artifact_type's Values slice (server/collections/bootstrap.go),
// reused everywhere a kind-by-kind pass needs stable output.
var kindOrder = []string{
	"directive",
	"tactic",
	"procedure",
	"styleguide",
	"toolguide",
	"profile",
	"mission_step_contract",
	"template",
	"glossary",
}

// doctrineFieldByKind is the authoritative mapping from this project's
// pack_artifacts.artifact_type to governance.yaml's doctrine.<key>. Seven
// entries are native DoctrineSelectionConfig fields (src/charter/schemas.py
// in https://github.com/Priivacy-ai/spec-kitty); "template" and "glossary"
// have no native list field, so they use project-added keys that
// spec-kitty's own tooling silently ignores (no extra="forbid" on the
// Pydantic model).
var doctrineFieldByKind = map[string]string{
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

// kindDisplayName renders a kind for use as a charter.md section heading.
var kindDisplayName = map[string]string{
	"directive":             "Directives",
	"tactic":                "Tactics",
	"procedure":             "Procedures",
	"styleguide":            "Styleguides",
	"toolguide":             "Toolguides",
	"profile":               "Agent Profiles",
	"mission_step_contract": "Mission Step Contracts",
	"template":              "Templates",
	"glossary":              "Glossary",
}

// BundleItem is the pure-Go input to bundle assembly: an enabled charter
// item plus the extra content needed to summarize it, pulled from the
// source pack_artifacts row. Only enabled, non-conflicting, non-missing-
// source items should ever be passed in — this package does not
// re-derive that filter.
type BundleItem struct {
	ArtifactType string
	ArtifactID   string
	ArtifactName string
	Content      map[string]any
}

// CharterBundle is the in-memory result of assembling a charter's four
// bundle files. WP06 consumes this for both the ephemeral-repo write and
// the zip step; no filesystem or git I/O happens in this package.
type CharterBundle struct {
	CharterMD      []byte
	GovernanceYAML []byte
	DirectivesYAML []byte
	MetadataYAML   []byte
}

// sortedByKindThenID returns a copy of items sorted by (ArtifactType,
// ArtifactID) using kindOrder for the type component, so every builder in
// this file produces byte-identical output across repeated calls with the
// same input.
func sortedByKindThenID(items []BundleItem) []BundleItem {
	kindRank := make(map[string]int, len(kindOrder))
	for i, k := range kindOrder {
		kindRank[k] = i
	}

	sorted := make([]BundleItem, len(items))
	copy(sorted, items)
	sort.SliceStable(sorted, func(i, j int) bool {
		ri, rj := kindRank[sorted[i].ArtifactType], kindRank[sorted[j].ArtifactType]
		if ri != rj {
			return ri < rj
		}
		return sorted[i].ArtifactID < sorted[j].ArtifactID
	})
	return sorted
}

// BuildCharterMarkdown renders the human-readable half of the bundle: one
// "##" section per kind present among items (in kindOrder), each item as a
// bullet. Zero items still produces a minimal, valid, non-empty document
// per spec.md's zero-enabled-items edge case.
func BuildCharterMarkdown(charterName string, items []BundleItem) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n", charterName)

	if len(items) == 0 {
		b.WriteString("_No items are currently enabled in this charter._\n")
		return []byte(b.String())
	}

	byKind := make(map[string][]BundleItem, len(kindOrder))
	for _, item := range sortedByKindThenID(items) {
		byKind[item.ArtifactType] = append(byKind[item.ArtifactType], item)
	}

	first := true
	for _, kind := range kindOrder {
		kindItems := byKind[kind]
		if len(kindItems) == 0 {
			continue
		}
		if !first {
			b.WriteString("\n")
		}
		first = false

		heading := kindDisplayName[kind]
		if heading == "" {
			heading = kind
		}
		fmt.Fprintf(&b, "## %s\n\n", heading)
		for _, item := range kindItems {
			fmt.Fprintf(&b, "- **%s** (`%s`): %s\n", item.ArtifactName, item.ArtifactID, itemSummary(item))
		}
	}

	return []byte(b.String())
}

// itemSummary extracts a short, best-effort description from an item's
// pack-artifact content, falling back to a generic note when no
// reasonably short string is available. This is not schema-critical:
// spec-kitty's `bundle validate` never parses charter.md's content.
func itemSummary(item BundleItem) string {
	if item.Content != nil {
		for _, key := range []string{"description", "summary", "title"} {
			if v, ok := item.Content[key]; ok {
				if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
					return strings.TrimSpace(s)
				}
			}
		}
	}
	return fmt.Sprintf("%s artifact from pack composer", item.ArtifactType)
}

// governanceConfig mirrors spec-kitty's src/charter/schemas.py GovernanceConfig
// well enough for round-trip YAML I/O; unrecognized top-level keys are
// simply absent since this project has no source of truth for them.
type governanceConfig struct {
	Testing        governanceTesting        `yaml:"testing"`
	Quality        governanceQuality        `yaml:"quality"`
	Commits        governanceCommits        `yaml:"commits"`
	Performance    governancePerformance    `yaml:"performance"`
	BranchStrategy governanceBranchStrategy `yaml:"branch_strategy"`
	Doctrine       map[string][]string      `yaml:"doctrine"`
	Enforcement    map[string]any           `yaml:"enforcement"`
}

type governanceTesting struct {
	MinCoverage  int    `yaml:"min_coverage"`
	TDDRequired  bool   `yaml:"tdd_required"`
	Framework    string `yaml:"framework"`
	TypeChecking string `yaml:"type_checking"`
}

type governanceQuality struct {
	Linting        string `yaml:"linting"`
	PRApprovals    int    `yaml:"pr_approvals"`
	PreCommitHooks bool   `yaml:"pre_commit_hooks"`
}

type governanceCommits struct {
	Convention *string `yaml:"convention"`
}

type governancePerformance struct {
	CLITimeoutSeconds float64 `yaml:"cli_timeout_seconds"`
	DashboardMaxWPs   int     `yaml:"dashboard_max_wps"`
}

type governanceBranchStrategy struct {
	MainBranch string   `yaml:"main_branch"`
	DevBranch  *string  `yaml:"dev_branch"`
	Rules      []string `yaml:"rules"`
}

// BuildGovernanceYAML groups items by ArtifactType and populates the 9
// doctrine.selected_<kind> lists (7 native DoctrineSelectionConfig fields
// plus 2 project-added keys) per the mapping table verified against
// spec-kitty's real schema. Every one of the 9 keys is always present,
// even when empty, since WP07's import parser expects the key to exist.
// All other GovernanceConfig sections are zero-value defaults; this
// project has no source of truth for spec-kitty's own project-governance
// concepts (testing/quality/commits/performance/branch_strategy/enforcement).
func BuildGovernanceYAML(items []BundleItem) ([]byte, error) {
	byKind := make(map[string][]string, len(kindOrder))
	for _, kind := range kindOrder {
		byKind[kind] = []string{}
	}
	for _, item := range items {
		byKind[item.ArtifactType] = append(byKind[item.ArtifactType], item.ArtifactID)
	}
	for kind := range byKind {
		sort.Strings(byKind[kind])
	}

	doctrine := make(map[string][]string, len(kindOrder))
	for _, kind := range kindOrder {
		field := doctrineFieldByKind[kind]
		doctrine[field] = byKind[kind]
	}

	cfg := governanceConfig{
		Testing: governanceTesting{
			MinCoverage:  0,
			TDDRequired:  false,
			Framework:    "",
			TypeChecking: "",
		},
		Quality: governanceQuality{
			Linting:        "",
			PRApprovals:    1,
			PreCommitHooks: false,
		},
		Commits: governanceCommits{Convention: nil},
		Performance: governancePerformance{
			CLITimeoutSeconds: 2.0,
			DashboardMaxWPs:   100,
		},
		BranchStrategy: governanceBranchStrategy{
			MainBranch: "main",
			DevBranch:  nil,
			Rules:      []string{},
		},
		Doctrine:    doctrine,
		Enforcement: map[string]any{},
	}

	return yaml.Marshal(cfg)
}

// directiveEntry is one entry of directives.yaml's `directives` list.
type directiveEntry struct {
	ID          string   `yaml:"id"`
	Title       string   `yaml:"title"`
	Description string   `yaml:"description"`
	Severity    string   `yaml:"severity"`
	References  []string `yaml:"references"`
}

// BuildDirectivesYAML filters items to ArtifactType == "directive" and
// emits {directives: [...]}, one entry per enabled directive item, sorted
// by ArtifactID for deterministic output.
func BuildDirectivesYAML(items []BundleItem) ([]byte, error) {
	var directiveItems []BundleItem
	for _, item := range items {
		if item.ArtifactType == "directive" {
			directiveItems = append(directiveItems, item)
		}
	}
	sort.SliceStable(directiveItems, func(i, j int) bool {
		return directiveItems[i].ArtifactID < directiveItems[j].ArtifactID
	})

	entries := make([]directiveEntry, 0, len(directiveItems))
	for _, item := range directiveItems {
		entries = append(entries, directiveEntry{
			ID:          item.ArtifactID,
			Title:       item.ArtifactName,
			Description: itemSummary(item),
			Severity:    "warn",
			References:  []string{},
		})
	}

	return yaml.Marshal(map[string]any{"directives": entries})
}

// sectionsParsed mirrors metadata.yaml's nested sections_parsed object.
type sectionsParsed struct {
	Structured int `yaml:"structured"`
	AIAssisted int `yaml:"ai_assisted"`
	Skipped    int `yaml:"skipped"`
}

// bundleMetadata is a flat, top-level metadata.yaml representation.
// schema_version is the extraction-format string version; it is a
// different, unrelated field from bundle_schema_version, which must be
// emitted as an integer (see specKittyBundleSchemaVersion).
type bundleMetadata struct {
	SchemaVersion       string         `yaml:"schema_version"`
	ExtractedAt         string         `yaml:"extracted_at"`
	CharterHash         string         `yaml:"charter_hash"`
	SourcePath          string         `yaml:"source_path"`
	ExtractionMode      string         `yaml:"extraction_mode"`
	SectionsParsed      sectionsParsed `yaml:"sections_parsed"`
	BundleSchemaVersion int            `yaml:"bundle_schema_version"`
}

// BuildMetadataYAML computes charter_hash from charterMD's bytes and
// stamps extracted_at from the caller-supplied now (a real wall clock in
// production, a fixed value in tests) so this function stays pure and
// deterministic for a given input. bundle_schema_version is always the
// hard-coded specKittyBundleSchemaVersion constant as an integer — see
// the package-level warning on that constant for why this matters.
func BuildMetadataYAML(charterMD []byte, enabledCount int, now time.Time) ([]byte, error) {
	sum := sha256.Sum256(charterMD)
	meta := bundleMetadata{
		SchemaVersion:  "1.0.0",
		ExtractedAt:    now.UTC().Format(time.RFC3339),
		CharterHash:    "sha256:" + hex.EncodeToString(sum[:]),
		SourcePath:     ".kittify/charter/charter.md",
		ExtractionMode: "deterministic",
		SectionsParsed: sectionsParsed{
			Structured: enabledCount,
			AIAssisted: 0,
			Skipped:    0,
		},
		BundleSchemaVersion: specKittyBundleSchemaVersion,
	}

	return yaml.Marshal(meta)
}

// AssembleBundle builds all four bundle files from a charter's enabled
// items, in the order required by their dependencies (charter.md must be
// built first since BuildMetadataYAML hashes its bytes). Zero items is a
// valid, non-error input per spec.md's zero-enabled-items edge case.
func AssembleBundle(charterName string, items []BundleItem, now time.Time) (*CharterBundle, error) {
	charterMD := BuildCharterMarkdown(charterName, items)

	governanceYAML, err := BuildGovernanceYAML(items)
	if err != nil {
		return nil, fmt.Errorf("build governance.yaml: %w", err)
	}

	directivesYAML, err := BuildDirectivesYAML(items)
	if err != nil {
		return nil, fmt.Errorf("build directives.yaml: %w", err)
	}

	metadataYAML, err := BuildMetadataYAML(charterMD, len(items), now)
	if err != nil {
		return nil, fmt.Errorf("build metadata.yaml: %w", err)
	}

	return &CharterBundle{
		CharterMD:      charterMD,
		GovernanceYAML: governanceYAML,
		DirectivesYAML: directivesYAML,
		MetadataYAML:   metadataYAML,
	}, nil
}
