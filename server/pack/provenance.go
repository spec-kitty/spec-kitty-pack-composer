package pack

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ProvenanceDirName is the canonical sidecar directory Spec Kitty writes beside
// an artifact. See the doctrine synthesizer's provenance writer, which places
// sidecars at <artifact_dir>/.provenance/<artifact_id>.yaml.
const ProvenanceDirName = ".provenance"

// ProvenanceStatus classifies an artifact's relationship to an upstream
// document. Disk freshness (has this file changed) is a different question and
// stays with the refresh endpoint.
type ProvenanceStatus string

const (
	// ProvenanceAuthored means the artifact is itself the source of truth.
	// No upstream document exists, so there is nothing for it to be stale
	// against. Most hand-written doctrine is this, and it is not a defect.
	ProvenanceAuthored ProvenanceStatus = "authored"

	// ProvenanceDeclared means a canonical sidecar records what the artifact
	// was derived from, so staleness is answerable.
	ProvenanceDeclared ProvenanceStatus = "declared"

	// ProvenanceUndeclared means the artifact claims derivation in its own
	// body but no sidecar records from what. This is the only one of the three
	// that is a defect: the pointer was meant to exist and does not.
	ProvenanceUndeclared ProvenanceStatus = "undeclared"
)

// Provenance is what a canonical sidecar records about one artifact.
//
// Fields mirror the sidecar schema rather than reshaping it, so a reader can be
// held to the written contract. Unknown keys are preserved in Extra so a
// schema_version bump upstream does not silently drop information.
type Provenance struct {
	Status              ProvenanceStatus `json:"status"`
	SchemaVersion       string           `json:"schema_version,omitempty"`
	Source              string           `json:"source,omitempty"`
	SourceInputIDs      []string         `json:"source_input_ids,omitempty"`
	SourceMissionID     string           `json:"source_mission_id,omitempty"`
	ProducedAt          string           `json:"produced_at,omitempty"`
	SynthesizerVersion  string           `json:"synthesizer_version,omitempty"`
	CorpusSnapshotID    string           `json:"corpus_snapshot_id,omitempty"`
	SidecarRelativePath string           `json:"sidecar_relative_path,omitempty"`
	Extra               map[string]any   `json:"extra,omitempty"`
}

// derivationKeys are body fields that assert an artifact came from somewhere
// else. Their presence without a sidecar is what separates a real missing
// pointer from an artifact that was simply authored in place.
var derivationKeys = []string{
	"source_document",
	"source_documents",
	"derived_from",
	"seed",
	"seed_document",
	"upstream",
}

// provenanceIndex maps artifact id to the sidecar that declares it, for one
// artifact directory.
type provenanceIndex map[string]Provenance

// loadProvenanceDir reads every sidecar in artifactDir/.provenance.
//
// Sidecars are indexed by the artifact_id recorded inside the YAML body, not by
// filename. The writer sanitizes filenames (ids can contain path separators and
// colons), so the body is the only lossless key and matching on it keeps this
// reader correct without reimplementing the writer's sanitizer.
func loadProvenanceDir(root, artifactDirRelSlash string) provenanceIndex {
	dir := root
	if artifactDirRelSlash != "" && artifactDirRelSlash != "." {
		dir = filepath.Join(root, filepath.FromSlash(artifactDirRelSlash))
	}
	provDir := filepath.Join(dir, ProvenanceDirName)

	entries, err := os.ReadDir(provDir)
	if err != nil {
		return nil
	}

	index := provenanceIndex{}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".yaml") &&
			!strings.HasSuffix(strings.ToLower(name), ".yml") {
			continue
		}

		raw, err := os.ReadFile(filepath.Join(provDir, name))
		if err != nil {
			continue
		}
		var body map[string]any
		if err := yaml.Unmarshal(raw, &body); err != nil || body == nil {
			continue
		}
		id, _ := body["artifact_id"].(string)
		if id == "" {
			// A sidecar that does not name its artifact cannot be attributed.
			continue
		}

		rel := ProvenanceDirName + "/" + name
		if artifactDirRelSlash != "" && artifactDirRelSlash != "." {
			rel = artifactDirRelSlash + "/" + rel
		}
		index[id] = provenanceFromBody(body, rel)
	}
	return index
}

func provenanceFromBody(body map[string]any, sidecarRelSlash string) Provenance {
	p := Provenance{
		Status:              ProvenanceDeclared,
		SidecarRelativePath: sidecarRelSlash,
	}

	known := map[string]struct{}{"artifact_id": {}}
	takeString := func(key string) string {
		known[key] = struct{}{}
		s, _ := body[key].(string)
		return s
	}

	p.SchemaVersion = takeString("schema_version")
	p.Source = takeString("source")
	p.SourceMissionID = takeString("source_mission_id")
	p.ProducedAt = takeString("produced_at")
	p.SynthesizerVersion = takeString("synthesizer_version")
	p.CorpusSnapshotID = takeString("corpus_snapshot_id")

	known["source_input_ids"] = struct{}{}
	if list, ok := body["source_input_ids"].([]any); ok {
		for _, item := range list {
			if s, ok := item.(string); ok {
				p.SourceInputIDs = append(p.SourceInputIDs, s)
			}
		}
	}

	for key, value := range body {
		if _, seen := known[key]; seen {
			continue
		}
		if p.Extra == nil {
			p.Extra = map[string]any{}
		}
		p.Extra[key] = value
	}
	return p
}

// classifyProvenance decides an artifact's provenance status from the sidecar
// index for its directory and its own parsed body.
func classifyProvenance(index provenanceIndex, artifactID string, content map[string]any) Provenance {
	if p, ok := index[artifactID]; ok {
		return p
	}
	for _, key := range derivationKeys {
		if value, ok := content[key]; ok && !isEmptyValue(value) {
			return Provenance{Status: ProvenanceUndeclared}
		}
	}
	return Provenance{Status: ProvenanceAuthored}
}

func isEmptyValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(typed) == ""
	case []any:
		return len(typed) == 0
	case map[string]any:
		return len(typed) == 0
	default:
		return false
	}
}

// isProvenanceDir reports whether a walked directory holds sidecars.
func isProvenanceDir(d fs.DirEntry) bool {
	return d.IsDir() && d.Name() == ProvenanceDirName
}
