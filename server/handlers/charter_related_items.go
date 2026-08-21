package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// referenceEntry mirrors one entry of an artifact's own `references: [...]`
// YAML frontmatter list — spec-kitty's generic, typed cross-artifact
// reference convention (id, name, type, when), preserved verbatim inside
// pack_artifacts.content by the importer but never otherwise parsed.
type referenceEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	When string `json:"when"`
}

// relatedItemDTO matches contracts/charters-api.yaml RelatedItem.
type relatedItemDTO struct {
	PackArtifactID   string `json:"pack_artifact_id"`
	ArtifactType     string `json:"artifact_type"`
	ArtifactID       string `json:"artifact_id"`
	Name             string `json:"name"`
	PackName         string `json:"pack_name"`
	AlreadyInCharter bool   `json:"already_in_charter"`
}

// relatedItemsTargetDTO matches contracts/charters-api.yaml RelatedItemsTarget.
type relatedItemsTargetDTO struct {
	PackArtifactID string `json:"pack_artifact_id"`
	ArtifactType   string `json:"artifact_type"`
	ArtifactID     string `json:"artifact_id"`
	Name           string `json:"name"`
}

// relatedItemsResultDTO matches contracts/charters-api.yaml RelatedItemsResult.
type relatedItemsResultDTO struct {
	Target  relatedItemsTargetDTO `json:"target"`
	Related []relatedItemDTO      `json:"related"`
}

type addItemsBulkRequest struct {
	PackArtifactIDs []string `json:"pack_artifact_ids"`
}

// bulkAddResultDTO matches contracts/charters-api.yaml BulkAddResult.
type bulkAddResultDTO struct {
	Items               []charterItemDTO `json:"items"`
	AddedCount          int              `json:"added_count"`
	AlreadyPresentCount int              `json:"already_present_count"`
}

// referencesFromContent decodes the `references` list embedded in an
// artifact's parsed `content` JSON blob. Returns nil when absent or
// malformed rather than erroring — a missing/invalid references list simply
// means "this artifact references nothing."
func referencesFromContent(rec *core.Record) []referenceEntry {
	raw, ok := rec.Get("content").(types.JSONRaw)
	if !ok || len(raw) == 0 {
		return nil
	}
	var content map[string]json.RawMessage
	if err := json.Unmarshal(raw, &content); err != nil {
		return nil
	}
	refsRaw, ok := content["references"]
	if !ok {
		return nil
	}
	var refs []referenceEntry
	if err := json.Unmarshal(refsRaw, &refs); err != nil {
		return nil
	}
	return refs
}

// findArtifactsReferencing returns every pack_artifacts record (any pack,
// any type) whose own `references` list contains an entry matching
// (artifactType, artifactID) — the reverse of the "this artifact
// specializes/depends on that one" direction the references convention
// normally encodes (e.g. a tactic references the directive it specializes;
// this resolves "which tactics reference directive X" given X).
func findArtifactsReferencing(app core.App, artifactType, artifactID string) ([]*core.Record, error) {
	all, err := app.FindAllRecords("pack_artifacts")
	if err != nil {
		return nil, err
	}
	matches := make([]*core.Record, 0)
	for _, rec := range all {
		for _, ref := range referencesFromContent(rec) {
			if ref.Type == artifactType && ref.ID == artifactID {
				matches = append(matches, rec)
				break
			}
		}
	}
	return matches, nil
}

// getRelatedCharterItems handles
// GET /api/charters/{charterId}/items/related?pack_artifact_id=X.
//
// FR-026: only directive-type targets can have related items — every other
// artifact type returns an empty `related` list, so the frontend can treat
// "no related items" as the signal to add directly with no confirmation
// dialog, exactly like adding any other artifact.
func getRelatedCharterItems(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")

	charterRec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if charterRec == nil {
		return notFound(e, "charter or pack artifact not found")
	}

	packArtifactID := e.Request.URL.Query().Get("pack_artifact_id")
	if packArtifactID == "" {
		return badRequest(e, "pack_artifact_id is required", "missing_pack_artifact_id")
	}

	artifactRec, err := e.App.FindRecordById("pack_artifacts", packArtifactID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return notFound(e, "charter or pack artifact not found")
		}
		return e.InternalServerError("failed to load pack artifact", err)
	}

	target := relatedItemsTargetDTO{
		PackArtifactID: artifactRec.Id,
		ArtifactType:   artifactRec.GetString("artifact_type"),
		ArtifactID:     artifactRec.GetString("artifact_id"),
		Name:           artifactRec.GetString("name"),
	}

	if target.ArtifactType != "directive" {
		return e.JSON(http.StatusOK, relatedItemsResultDTO{Target: target, Related: []relatedItemDTO{}})
	}

	referencing, err := findArtifactsReferencing(e.App, "directive", target.ArtifactID)
	if err != nil {
		return e.InternalServerError("failed to search related artifacts", err)
	}

	related := make([]relatedItemDTO, 0, len(referencing))
	for _, rec := range referencing {
		if rec.Id == artifactRec.Id {
			continue
		}
		packName, perr := packNameForArtifact(e.App, rec)
		if perr != nil {
			return e.InternalServerError("failed to load pack", perr)
		}
		existing, ferr := findCharterItemByIdentity(
			e.App, charterID, rec.GetString("artifact_type"), rec.GetString("artifact_id"), packName,
		)
		if ferr != nil {
			return e.InternalServerError("failed to check for existing item", ferr)
		}
		related = append(related, relatedItemDTO{
			PackArtifactID:   rec.Id,
			ArtifactType:     rec.GetString("artifact_type"),
			ArtifactID:       rec.GetString("artifact_id"),
			Name:             rec.GetString("name"),
			PackName:         packName,
			AlreadyInCharter: existing != nil,
		})
	}

	return e.JSON(http.StatusOK, relatedItemsResultDTO{Target: target, Related: related})
}

// addCharterItemsBulk handles POST /api/charters/{charterId}/items/bulk.
//
// Adds every listed pack_artifact_id to the charter in a single request —
// used to add a directive together with the related items (FR-026) the
// maintainer confirmed, but generic enough for any batch of ids. Runs in one
// transaction so a conflict introduced between two items in the same
// request (per FR-011) resolves consistently, and so a failure partway
// through never leaves a partial add.
func addCharterItemsBulk(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")

	charterRec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if charterRec == nil {
		return notFound(e, "charter not found")
	}

	var req addItemsBulkRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", "invalid_body")
	}

	// De-dupe while preserving order — the same id appearing twice in the
	// request must not be inserted twice.
	seen := make(map[string]bool, len(req.PackArtifactIDs))
	ids := make([]string, 0, len(req.PackArtifactIDs))
	for _, id := range req.PackArtifactIDs {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return badRequest(e, "pack_artifact_ids must contain at least one id", "missing_pack_artifact_ids")
	}

	recs := make([]*core.Record, 0, len(ids))
	addedCount := 0
	alreadyPresentCount := 0

	err = e.App.RunInTransaction(func(txApp core.App) error {
		for _, id := range ids {
			rec, created, aerr := addOrGetCharterItem(txApp, charterID, id)
			if aerr != nil {
				return aerr
			}
			recs = append(recs, rec)
			if created {
				addedCount++
			} else {
				alreadyPresentCount++
			}
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return notFound(e, "charter or pack artifact not found")
		}
		return e.InternalServerError("failed to save charter items", err)
	}

	allConflicts, err := conflictingIDsForCharter(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to build response", err)
	}

	items := make([]charterItemDTO, 0, len(recs))
	for _, rec := range recs {
		items = append(items, charterItemDTOFromRecord(e.App, rec, allConflicts[rec.Id]))
	}

	return e.JSON(http.StatusOK, bulkAddResultDTO{
		Items:               items,
		AddedCount:          addedCount,
		AlreadyPresentCount: alreadyPresentCount,
	})
}
