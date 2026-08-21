package handlers

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"

	"github.com/spec-kitty/pack-composer/server/charter"
)

// gridKinds is the fixed, ordered set of the 9 artifact kinds the
// CharterGrid response must always report — even when a kind has zero
// cards — so WP12's category filter chips can render a stable set.
var gridKinds = []string{
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

// charterGridCardDTO matches contracts/charters-api.yaml CharterGridCard.
type charterGridCardDTO struct {
	ArtifactType   string `json:"artifact_type"`
	ArtifactID     string `json:"artifact_id"`
	ArtifactName   string `json:"artifact_name"`
	PackName       string `json:"pack_name"`
	PackArtifactID string `json:"pack_artifact_id,omitempty"`
	CharterItemID  string `json:"charter_item_id,omitempty"`
	InCharter      bool   `json:"in_charter"`
	Enabled        bool   `json:"enabled"`
	Conflicting    bool   `json:"conflicting"`
	MissingSource  bool   `json:"missing_source"`
}

// charterGridDTO matches contracts/charters-api.yaml CharterGrid: a map
// keyed by artifact kind, always containing all 9 gridKinds keys.
type charterGridDTO map[string][]charterGridCardDTO

// charterItemIdentity is the (artifact_type, artifact_id, pack_name) tuple
// used to match a pack_artifacts record (via its owning pack's name) to a
// charter_items row — the same tuple as WP01's unique index.
type charterItemIdentity struct {
	artifactType string
	artifactID   string
	packName     string
}

func identityForRecord(artifactType, artifactID, packName string) charterItemIdentity {
	return charterItemIdentity{artifactType: artifactType, artifactID: artifactID, packName: packName}
}

// buildCharterGrid performs the single-pass join described in
// WP04-charter-grid-route.md T017/T018: exactly 3 bulk reads (packs,
// pack_artifacts, this charter's charter_items), then pure in-memory
// joining/annotation — no per-artifact or per-pack queries.
func buildCharterGrid(app core.App, charterID string) (charterGridDTO, error) {
	packNodes, err := loadPackNodes(app)
	if err != nil {
		return nil, err
	}
	packNameByID := make(map[string]string, len(packNodes))
	for _, p := range packNodes {
		packNameByID[p.ID] = p.Name
	}

	artifactRecs, err := app.FindAllRecords("pack_artifacts")
	if err != nil {
		return nil, err
	}

	itemRecs, err := loadCharterItems(app, charterID)
	if err != nil {
		return nil, err
	}

	// Lookup from (artifact_type, artifact_id, pack_name) -> charter_items
	// record, for annotating pack_artifacts in the first pass.
	itemByIdentity := make(map[charterItemIdentity]*core.Record, len(itemRecs))
	for _, item := range itemRecs {
		key := identityForRecord(item.GetString("artifact_type"), item.GetString("artifact_id"), item.GetString("pack_name"))
		itemByIdentity[key] = item
	}

	// Conflict computation is over this charter's own charter_items only
	// (per T017 step 3), reusing WP03's conflict.go rather than
	// reimplementing conflict grouping here. Built directly from the
	// already-loaded itemRecs (not charterItemToDomainItem, which would
	// add a per-item pack_artifacts lookup for MissingSource — a field
	// GroupConflicts never reads) to keep this route's query count fixed.
	domainItems := make([]charter.Item, 0, len(itemRecs))
	for _, item := range itemRecs {
		domainItems = append(domainItems, charter.Item{
			ID:           item.Id,
			ArtifactType: item.GetString("artifact_type"),
			ArtifactID:   item.GetString("artifact_id"),
			PackName:     item.GetString("pack_name"),
			Enabled:      item.GetBool("enabled"),
		})
	}
	conflictGroups := charter.GroupConflicts(domainItems)
	conflictingItemIDs := make(map[string]bool)
	for _, group := range conflictGroups {
		for _, member := range group {
			conflictingItemIDs[member.ID] = true
		}
	}

	// Existing pack_artifacts ids, for T018's missing-source detection
	// (a charter_items row's pack_artifact relation pointing at nothing in
	// this set).
	liveArtifactIDs := make(map[string]bool, len(artifactRecs))
	for _, art := range artifactRecs {
		liveArtifactIDs[art.Id] = true
	}

	grid := make(charterGridDTO, len(gridKinds))
	for _, kind := range gridKinds {
		grid[kind] = []charterGridCardDTO{}
	}

	// First pass: every live pack_artifacts record, annotated with this
	// charter's membership state.
	matchedItemIDs := make(map[string]bool, len(itemRecs))
	for _, art := range artifactRecs {
		artifactType := art.GetString("artifact_type")
		artifactID := art.GetString("artifact_id")
		packName := packNameByID[art.GetString("pack")]

		card := charterGridCardDTO{
			ArtifactType:   artifactType,
			ArtifactID:     artifactID,
			ArtifactName:   art.GetString("name"),
			PackName:       packName,
			PackArtifactID: art.Id,
		}

		key := identityForRecord(artifactType, artifactID, packName)
		if item, ok := itemByIdentity[key]; ok {
			matchedItemIDs[item.Id] = true
			card.InCharter = true
			card.CharterItemID = item.Id
			card.Enabled = item.GetBool("enabled")
			card.Conflicting = conflictingItemIDs[item.Id]
		}

		grid[artifactType] = append(grid[artifactType], card)
	}

	// Second pass (T018): charter_items rows that had no match in the
	// first pass (their pack_artifact relation no longer resolves to a
	// live pack_artifacts record — data-model.md's "missing source",
	// derived directly from the already-loaded liveArtifactIDs set, no
	// extra query) get their own card, built from denormalized fields,
	// and are never silently dropped.
	for _, item := range itemRecs {
		if matchedItemIDs[item.Id] {
			continue
		}

		packArtifactID := item.GetString("pack_artifact")
		missingSource := packArtifactID == "" || !liveArtifactIDs[packArtifactID]

		artifactType := item.GetString("artifact_type")
		grid[artifactType] = append(grid[artifactType], charterGridCardDTO{
			ArtifactType:  artifactType,
			ArtifactID:    item.GetString("artifact_id"),
			ArtifactName:  item.GetString("artifact_name"),
			PackName:      item.GetString("pack_name"),
			CharterItemID: item.Id,
			InCharter:     true,
			Enabled:       item.GetBool("enabled"),
			Conflicting:   conflictingItemIDs[item.Id],
			MissingSource: missingSource,
		})
	}

	return grid, nil
}

// getCharterGrid handles GET /api/charters/{charterId}/grid.
func getCharterGrid(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")

	charterRec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if charterRec == nil {
		return notFound(e, "charter not found")
	}

	grid, err := buildCharterGrid(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to build charter grid", err)
	}

	return e.JSON(http.StatusOK, grid)
}
