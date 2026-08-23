package pack

// ArtifactType matches data-model select values for pack_artifacts.artifact_type.
type ArtifactType string

const (
	ArtifactDirective           ArtifactType = "directive"
	ArtifactTactic              ArtifactType = "tactic"
	ArtifactProcedure           ArtifactType = "procedure"
	ArtifactStyleguide          ArtifactType = "styleguide"
	ArtifactToolguide           ArtifactType = "toolguide"
	ArtifactProfile             ArtifactType = "profile"
	ArtifactMissionStepContract ArtifactType = "mission_step_contract"
	ArtifactTemplate            ArtifactType = "template"
	ArtifactGlossary            ArtifactType = "glossary"
)

// ScannedFile is a recognizable artifact path discovered under a pack root.
type ScannedFile struct {
	RelativePath string       `json:"relative_path"`
	ArtifactType ArtifactType `json:"artifact_type"`
}

// ParsedArtifact is an in-memory parse result (no PocketBase writes).
type ParsedArtifact struct {
	ArtifactType       ArtifactType   `json:"artifact_type"`
	ArtifactID         string         `json:"artifact_id"`
	Name               string         `json:"name"`
	Category           string         `json:"category,omitempty"`
	Roles              []string       `json:"roles,omitempty"`
	DomainKeywords     []string       `json:"domain_keywords,omitempty"`
	ParseOK            bool           `json:"parse_ok"`
	ParseError         string         `json:"parse_error,omitempty"`
	Content            map[string]any `json:"content"`
	SourceRelativePath string         `json:"source_relative_path"`
	Provenance         Provenance     `json:"provenance"`
}

// Link is a README markdown link extracted for the Links card.
type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// PackMetadata is display metadata for a pack record (in-memory).
type PackMetadata struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	// ProjectKey is the pack's stable identity (org_name from org-charter.yaml).
	ProjectKey string `json:"project_key,omitempty"`
	// ParentID is the raw, unvalidated `extends` reference from org-charter.yaml.
	ParentID string `json:"parent_id,omitempty"`
	Version  string `json:"version,omitempty"`
	Links    []Link `json:"links,omitempty"`
}

// Stats is the denormalized sidebar/stats payload.
type Stats struct {
	Total  int            `json:"total"`
	ByType map[string]int `json:"by_type"`
}
