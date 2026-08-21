// Package charter contains pure domain logic for the charter bundle import
// feature (FR-019/FR-020/FR-021): structural validation of an uploaded
// charter bundle, parsing its governance.yaml back into artifact
// selections, and resolving those selections against currently-known
// pack_artifacts. None of the functions in this file touch PocketBase
// records or perform I/O — that persistence glue lives in
// server/handlers/charter_import.go.
package charter

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"sort"

	"gopkg.in/yaml.v3"
)

// Required entries inside an uploaded bundle zip (mirrors WP06's export
// layout — a maintainer re-importing their own just-exported bundle must
// round-trip cleanly). Only these two are required for this WP's parsing
// needs; directives.yaml/metadata.yaml are not validated as strictly since
// governance.yaml alone carries everything ResolveImportedItems needs.
const (
	bundleCharterMDPath      = ".kittify/charter/charter.md"
	bundleGovernanceYAMLPath = ".kittify/charter/governance.yaml"
)

// Artifact type identifiers, matching pack_artifacts.artifact_type's Select
// field values (server/collections/bootstrap.go). DoctrineArtifactTypeOrder
// fixes iteration order everywhere in this file so output is deterministic.
const (
	ArtifactTypeDirective           = "directive"
	ArtifactTypeTactic              = "tactic"
	ArtifactTypeProcedure           = "procedure"
	ArtifactTypeStyleguide          = "styleguide"
	ArtifactTypeToolguide           = "toolguide"
	ArtifactTypeProfile             = "profile"
	ArtifactTypeMissionStepContract = "mission_step_contract"
	ArtifactTypeTemplate            = "template"
	ArtifactTypeGlossary            = "glossary"
)

// DoctrineArtifactTypeOrder is the fixed, deterministic order this file
// walks the 9 artifact kinds in. Must stay in sync with
// pack_artifacts.artifact_type's Select field Values order.
var DoctrineArtifactTypeOrder = []string{
	ArtifactTypeDirective,
	ArtifactTypeTactic,
	ArtifactTypeProcedure,
	ArtifactTypeStyleguide,
	ArtifactTypeToolguide,
	ArtifactTypeProfile,
	ArtifactTypeMissionStepContract,
	ArtifactTypeTemplate,
	ArtifactTypeGlossary,
}

// ParsedBundleFiles holds the byte content of the bundle files this
// package actually parses, extracted from the uploaded zip once structural
// validation has passed.
type ParsedBundleFiles struct {
	CharterMD      []byte
	GovernanceYAML []byte
}

// ValidateBundleStructure requires the uploaded bytes to be a readable zip
// archive containing at minimum .kittify/charter/charter.md and
// .kittify/charter/governance.yaml (FR-021's "basic structural validation").
// It never creates, saves, or touches any PocketBase record — it operates
// purely on the in-memory zip bytes, and returns a clearly-worded error
// suitable for a 400 response body's message when validation fails.
func ValidateBundleStructure(zipBytes []byte) (*ParsedBundleFiles, error) {
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		return nil, fmt.Errorf("uploaded file is not a valid zip archive: %w", err)
	}

	byName := make(map[string]*zip.File, len(zr.File))
	for _, f := range zr.File {
		byName[f.Name] = f
	}

	charterMDFile, ok := byName[bundleCharterMDPath]
	if !ok {
		return nil, fmt.Errorf("bundle is missing required file %s", bundleCharterMDPath)
	}
	governanceFile, ok := byName[bundleGovernanceYAMLPath]
	if !ok {
		return nil, fmt.Errorf("bundle is missing required file %s", bundleGovernanceYAMLPath)
	}

	charterMD, err := readZipFile(charterMDFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s from bundle: %w", bundleCharterMDPath, err)
	}
	governanceYAML, err := readZipFile(governanceFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s from bundle: %w", bundleGovernanceYAMLPath, err)
	}

	return &ParsedBundleFiles{CharterMD: charterMD, GovernanceYAML: governanceYAML}, nil
}

func readZipFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

// governanceDoctrineDoc mirrors the subset of the real spec-kitty
// governance.yaml schema this project reads/writes under doctrine:. Field
// names and the artifact_type <-> selected_<kind> mapping below MUST stay
// byte-for-byte in sync with WP05's BuildGovernanceYAML (server/charter/
// bundle.go) — see research.md R4/R5. 7 keys are native spec-kitty
// DoctrineSelectionConfig fields; selected_templates/selected_glossary are
// this project's own additions with no native spec-kitty equivalent.
//
// Struct (rather than map[string]any) unmarshaling gives us "missing key
// -> nil slice" for free, which is exactly the defensive behavior T033
// requires for hand-edited/older-format bundles: a missing key parses as an
// empty list, not an error.
type governanceDoctrineDoc struct {
	Doctrine struct {
		SelectedDirectives           []string `yaml:"selected_directives"`
		SelectedTactics              []string `yaml:"selected_tactics"`
		SelectedProcedures           []string `yaml:"selected_procedures"`
		SelectedStyleguides          []string `yaml:"selected_styleguides"`
		SelectedToolguides           []string `yaml:"selected_toolguides"`
		SelectedAgentProfiles        []string `yaml:"selected_agent_profiles"`
		SelectedMissionStepContracts []string `yaml:"selected_mission_step_contracts"`
		SelectedTemplates            []string `yaml:"selected_templates"`
		SelectedGlossary             []string `yaml:"selected_glossary"`
	} `yaml:"doctrine"`
}

// ParseGovernanceSelections parses governance.yaml's doctrine: block and
// returns a map from this project's artifact_type value to the list of
// artifact_id strings selected for that kind. A governance.yaml missing
// one or more of the 9 selected_<kind> keys entirely (e.g. hand-edited, or
// produced by an older format — see C-005) parses successfully with an
// empty list for the missing kind(s), never an error.
func ParseGovernanceSelections(governanceYAML []byte) (map[string][]string, error) {
	var doc governanceDoctrineDoc
	if err := yaml.Unmarshal(governanceYAML, &doc); err != nil {
		return nil, fmt.Errorf("failed to parse governance.yaml: %w", err)
	}

	return map[string][]string{
		ArtifactTypeDirective:           doc.Doctrine.SelectedDirectives,
		ArtifactTypeTactic:              doc.Doctrine.SelectedTactics,
		ArtifactTypeProcedure:           doc.Doctrine.SelectedProcedures,
		ArtifactTypeStyleguide:          doc.Doctrine.SelectedStyleguides,
		ArtifactTypeToolguide:           doc.Doctrine.SelectedToolguides,
		ArtifactTypeProfile:             doc.Doctrine.SelectedAgentProfiles,
		ArtifactTypeMissionStepContract: doc.Doctrine.SelectedMissionStepContracts,
		ArtifactTypeTemplate:            doc.Doctrine.SelectedTemplates,
		ArtifactTypeGlossary:            doc.Doctrine.SelectedGlossary,
	}, nil
}

// KnownArtifact is a plain-data view of a single currently-imported
// pack_artifacts row, keyed by the identity ResolveImportedItems matches
// against. Callers (server/handlers/charter_import.go) build this slice
// from a FindAllRecords("pack_artifacts") query joined against packs for
// PackName — this package has no PocketBase dependency.
type KnownArtifact struct {
	PackArtifactID string
	ArtifactType   string
	ArtifactID     string
	ArtifactName   string
	PackID         string
	PackName       string
}

// ImportedItem carries enough information for a caller to build one
// charter_items row. Matched items carry a real PackArtifactID/PackID/
// PackName/ArtifactName; unmatched ("missing source") items carry empty
// values for those fields — the reference itself (ArtifactType/ArtifactID)
// is still present, never dropped (FR-020).
type ImportedItem struct {
	ArtifactType   string
	ArtifactID     string
	Matched        bool
	PackArtifactID string
	PackID         string
	PackName       string
	ArtifactName   string
	// Enabled is the enabled state this item should be created with. Only
	// false when this item is the second-or-later ImportedItem produced
	// for the same (artifact_type, artifact_id) identity because multiple
	// currently-imported packs provide it — mirrors addCharterItem's
	// "second addition of a conflicting identity starts disabled" rule
	// (FR-012), applied from the moment of creation rather than waiting
	// for a subsequent toggle.
	Enabled bool
}

type artifactIdentity struct {
	artifactType string
	artifactID   string
}

// ResolveImportedItems resolves each (artifact_type, artifact_id) pair
// named in selections against knownArtifacts (FR-020). A reference that
// matches no known artifact still produces an ImportedItem with
// Matched=false rather than being dropped. A reference that matches
// artifacts from more than one currently-imported pack produces one
// ImportedItem per matching pack — sorted deterministically by pack name so
// output is stable across runs — with only the first Enabled=true and every
// subsequent one Enabled=false, so two same-identity items are never
// created both enabled (FR-012 from the moment of import, not just from the
// next toggle).
//
// This function takes plain Go data in and returns plain Go data out — no
// PocketBase types, no I/O.
func ResolveImportedItems(selections map[string][]string, knownArtifacts []KnownArtifact) []ImportedItem {
	byIdentity := make(map[artifactIdentity][]KnownArtifact)
	for _, ka := range knownArtifacts {
		key := artifactIdentity{artifactType: ka.ArtifactType, artifactID: ka.ArtifactID}
		byIdentity[key] = append(byIdentity[key], ka)
	}
	for key, matches := range byIdentity {
		sorted := make([]KnownArtifact, len(matches))
		copy(sorted, matches)
		sort.Slice(sorted, func(i, j int) bool {
			if sorted[i].PackName != sorted[j].PackName {
				return sorted[i].PackName < sorted[j].PackName
			}
			return sorted[i].PackArtifactID < sorted[j].PackArtifactID
		})
		byIdentity[key] = sorted
	}

	var out []ImportedItem
	for _, kind := range DoctrineArtifactTypeOrder {
		for _, id := range selections[kind] {
			key := artifactIdentity{artifactType: kind, artifactID: id}
			matches := byIdentity[key]
			if len(matches) == 0 {
				out = append(out, ImportedItem{
					ArtifactType: kind,
					ArtifactID:   id,
					Matched:      false,
					Enabled:      true,
				})
				continue
			}
			for i, m := range matches {
				out = append(out, ImportedItem{
					ArtifactType:   kind,
					ArtifactID:     id,
					Matched:        true,
					PackArtifactID: m.PackArtifactID,
					PackID:         m.PackID,
					PackName:       m.PackName,
					ArtifactName:   m.ArtifactName,
					Enabled:        i == 0,
				})
			}
		}
	}
	return out
}
