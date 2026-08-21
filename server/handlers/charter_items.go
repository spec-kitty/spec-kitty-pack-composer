package handlers

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/spec-kitty/pack-composer/server/charter"
)

type addItemRequest struct {
	PackArtifactID string `json:"pack_artifact_id"`
}

type toggleItemRequest struct {
	Enabled bool `json:"enabled"`
}

// charterItemDTO matches contracts/charters-api.yaml CharterItem.
type charterItemDTO struct {
	ID                 string   `json:"id"`
	Charter            string   `json:"charter"`
	PackArtifact       string   `json:"pack_artifact,omitempty"`
	PackName           string   `json:"pack_name"`
	ArtifactType       string   `json:"artifact_type"`
	ArtifactID         string   `json:"artifact_id"`
	ArtifactName       string   `json:"artifact_name"`
	Enabled            bool     `json:"enabled"`
	ConflictingItemIDs []string `json:"conflicting_item_ids,omitempty"`
	MissingSource      bool     `json:"missing_source"`
}

// toggleResultDTO matches contracts/charters-api.yaml ToggleResult.
type toggleResultDTO struct {
	Item         charterItemDTO   `json:"item"`
	AutoDisabled []charterItemDTO `json:"auto_disabled"`
}

// findCharterByID loads a charters record by id, returning (nil, nil) when
// it doesn't exist (mirrors findPackByID's not-found-is-not-an-error shape).
// findCharterItemByID loads a charter_items record scoped to charterID.
// Returns (nil, nil) when the item doesn't exist OR belongs to a different
// charter, so a client-supplied itemId from another charter can't silently
// succeed against this charterId.
func findCharterItemByID(app core.App, charterID, itemID string) (*core.Record, error) {
	rec, err := app.FindRecordById("charter_items", itemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if rec.GetString("charter") != charterID {
		return nil, nil
	}
	return rec, nil
}

// isMissingSource reports whether rec's pack_artifact relation is empty or
// points to a pack_artifacts record that no longer exists — data-model.md's
// "Missing source" (derived, not stored) invariant.
func isMissingSource(app core.App, rec *core.Record) bool {
	packArtifactID := rec.GetString("pack_artifact")
	if packArtifactID == "" {
		return true
	}
	art, err := app.FindRecordById("pack_artifacts", packArtifactID)
	if err != nil || art == nil {
		return true
	}
	return false
}

// loadCharterItems loads every charter_items row for charterID.
func loadCharterItems(app core.App, charterID string) ([]*core.Record, error) {
	return app.FindRecordsByFilter(
		"charter_items",
		"charter={:charter}",
		"",
		0,
		0,
		dbx.Params{"charter": charterID},
	)
}

// charterItemToDomainItem maps a charter_items record to the pure
// charter.Item struct consumed by the conflict-group engine.
func charterItemToDomainItem(app core.App, rec *core.Record) charter.Item {
	return charter.Item{
		ID:            rec.Id,
		ArtifactType:  rec.GetString("artifact_type"),
		ArtifactID:    rec.GetString("artifact_id"),
		PackName:      rec.GetString("pack_name"),
		Enabled:       rec.GetBool("enabled"),
		MissingSource: isMissingSource(app, rec),
	}
}

// conflictingIDsForCharter computes CharterItem.conflicting_item_ids for
// every item in charterID in one pass, keyed by item id.
func conflictingIDsForCharter(app core.App, charterID string) (map[string][]string, error) {
	recs, err := loadCharterItems(app, charterID)
	if err != nil {
		return nil, err
	}
	items := make([]charter.Item, 0, len(recs))
	for _, r := range recs {
		items = append(items, charterItemToDomainItem(app, r))
	}
	return charter.ConflictingIDs(items), nil
}

func charterItemDTOFromRecord(app core.App, rec *core.Record, conflictingIDs []string) charterItemDTO {
	return charterItemDTO{
		ID:                 rec.Id,
		Charter:            rec.GetString("charter"),
		PackArtifact:       rec.GetString("pack_artifact"),
		PackName:           rec.GetString("pack_name"),
		ArtifactType:       rec.GetString("artifact_type"),
		ArtifactID:         rec.GetString("artifact_id"),
		ArtifactName:       rec.GetString("artifact_name"),
		Enabled:            rec.GetBool("enabled"),
		ConflictingItemIDs: conflictingIDs,
		MissingSource:      isMissingSource(app, rec),
	}
}

// charterItemDTOWithConflicts builds the response DTO for a single item,
// recomputing conflicting_item_ids over that charter's current items.
func charterItemDTOWithConflicts(app core.App, rec *core.Record) (charterItemDTO, error) {
	allConflicts, err := conflictingIDsForCharter(app, rec.GetString("charter"))
	if err != nil {
		return charterItemDTO{}, err
	}
	return charterItemDTOFromRecord(app, rec, allConflicts[rec.Id]), nil
}

func respondCharterItem(e *core.RequestEvent, rec *core.Record) error {
	dto, err := charterItemDTOWithConflicts(e.App, rec)
	if err != nil {
		return e.InternalServerError("failed to build response", err)
	}
	return e.JSON(http.StatusOK, dto)
}

// packNameForArtifact resolves the display name of the pack owning
// artifactRec, for denormalizing onto the new charter_items row.
func packNameForArtifact(app core.App, artifactRec *core.Record) (string, error) {
	packID := artifactRec.GetString("pack")
	packRec, err := app.FindRecordById("packs", packID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return packRec.GetString("name"), nil
}

// findCharterItemByIdentity looks up the existing charter_items row for the
// exact (charter, artifact_type, artifact_id, pack_name) tuple — the same
// tuple as WP01's unique index.
func findCharterItemByIdentity(app core.App, charterID, artifactType, artifactID, packName string) (*core.Record, error) {
	rec, err := app.FindFirstRecordByFilter(
		"charter_items",
		"charter={:charter} && artifact_type={:type} && artifact_id={:id} && pack_name={:pack}",
		dbx.Params{"charter": charterID, "type": artifactType, "id": artifactID, "pack": packName},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return rec, nil
}

// addOrGetCharterItem implements the core "add pack artifact to charter"
// logic shared by the single-item (addCharterItem) and bulk
// (addCharterItemsBulk, charter_related_items.go) endpoints: idempotent
// re-add of an existing identity (research.md R8), FR-011 conflict-state
// resolution, and race-safe insert. `created` is false when an existing row
// was returned instead of a new one being inserted.
func addOrGetCharterItem(app core.App, charterID, packArtifactID string) (rec *core.Record, created bool, err error) {
	artifactRec, err := app.FindRecordById("pack_artifacts", packArtifactID)
	if err != nil {
		return nil, false, err
	}

	packName, err := packNameForArtifact(app, artifactRec)
	if err != nil {
		return nil, false, err
	}

	artifactType := artifactRec.GetString("artifact_type")
	artifactID := artifactRec.GetString("artifact_id")

	existing, err := findCharterItemByIdentity(app, charterID, artifactType, artifactID, packName)
	if err != nil {
		return nil, false, err
	}
	if existing != nil {
		return existing, false, nil
	}

	conflictRec, err := app.FindFirstRecordByFilter(
		"charter_items",
		"charter={:charter} && artifact_type={:type} && artifact_id={:id} && enabled=true",
		dbx.Params{"charter": charterID, "type": artifactType, "id": artifactID},
	)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	enabled := conflictRec == nil

	col, err := app.FindCollectionByNameOrId("charter_items")
	if err != nil {
		return nil, false, err
	}

	newRec := core.NewRecord(col)
	newRec.Set("charter", charterID)
	newRec.Set("pack_artifact", artifactRec.Id)
	newRec.Set("pack_name", packName)
	newRec.Set("artifact_type", artifactType)
	newRec.Set("artifact_id", artifactID)
	newRec.Set("artifact_name", artifactRec.GetString("name"))
	newRec.Set("enabled", enabled)

	if err := app.Save(newRec); err != nil {
		// Race mitigation: a concurrent add for the same identity may have
		// won the unique-index race between our pre-check and this save.
		// Treat that as "already present" rather than surfacing a 500.
		if raced, ferr := findCharterItemByIdentity(app, charterID, artifactType, artifactID, packName); ferr == nil && raced != nil {
			return raced, false, nil
		}
		return nil, false, err
	}

	return newRec, true, nil
}

// addCharterItem handles POST /api/charters/{charterId}/items.
//
// Idempotent (research.md R8): re-adding the exact same
// (charter, pack_artifact) pair returns the existing row unchanged, not a
// new one. FR-011: if the new item's (artifact_type, artifact_id) is
// already enabled from a different pack, the new item is inserted disabled.
func addCharterItem(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")

	charterRec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if charterRec == nil {
		return notFound(e, "charter or pack artifact not found")
	}

	var req addItemRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", "invalid_body")
	}
	if req.PackArtifactID == "" {
		return badRequest(e, "pack_artifact_id is required", "missing_pack_artifact_id")
	}

	rec, _, err := addOrGetCharterItem(e.App, charterID, req.PackArtifactID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return notFound(e, "charter or pack artifact not found")
		}
		return e.InternalServerError("failed to save charter item", err)
	}

	return respondCharterItem(e, rec)
}

// removeCharterItem handles DELETE /api/charters/{charterId}/items/{itemId}.
// FR-010: hard delete regardless of the item's enabled/conflict state.
func removeCharterItem(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")
	itemID := e.Request.PathValue("itemId")

	charterRec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if charterRec == nil {
		return notFound(e, "charter not found")
	}

	itemRec, err := findCharterItemByID(e.App, charterID, itemID)
	if err != nil {
		return e.InternalServerError("failed to load charter item", err)
	}
	if itemRec == nil {
		return notFound(e, "charter item not found")
	}

	if err := e.App.Delete(itemRec); err != nil {
		return e.InternalServerError("failed to delete charter item", err)
	}

	return e.NoContent(http.StatusNoContent)
}

// toggleCharterItem handles POST /api/charters/{charterId}/items/{itemId}/toggle.
//
// FR-022: a missing-source item cannot be toggled either direction. FR-012:
// enabling an item that belongs to a conflict group atomically disables
// every other member of that group in the same transaction, so a crash
// mid-way can never leave two conflict-group members simultaneously enabled.
func toggleCharterItem(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")
	itemID := e.Request.PathValue("itemId")

	charterRec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if charterRec == nil {
		return notFound(e, "charter not found")
	}

	itemRec, err := findCharterItemByID(e.App, charterID, itemID)
	if err != nil {
		return e.InternalServerError("failed to load charter item", err)
	}
	if itemRec == nil {
		return notFound(e, "charter item not found")
	}

	var req toggleItemRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", "invalid_body")
	}

	// Missing-source guard runs before any conflict-group logic, and applies
	// regardless of the requested direction.
	if isMissingSource(e.App, itemRec) {
		return badRequest(e, "item has a missing source and cannot be toggled", "missing_source_not_toggleable")
	}

	if !req.Enabled {
		itemRec.Set("enabled", false)
		if err := e.App.Save(itemRec); err != nil {
			return e.InternalServerError("failed to save charter item", err)
		}
		return respondToggleResult(e, itemRec, nil)
	}

	recs, err := loadCharterItems(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter items", err)
	}
	items := make([]charter.Item, 0, len(recs))
	for _, r := range recs {
		items = append(items, charterItemToDomainItem(e.App, r))
	}

	_, autoDisabledIDs := charter.ResolveEnable(items, itemID)

	var enabledTarget *core.Record
	err = e.App.RunInTransaction(func(txApp core.App) error {
		target, ferr := txApp.FindRecordById("charter_items", itemID)
		if ferr != nil {
			return ferr
		}
		target.Set("enabled", true)
		if ferr := txApp.Save(target); ferr != nil {
			return ferr
		}
		enabledTarget = target

		for _, id := range autoDisabledIDs {
			other, ferr := txApp.FindRecordById("charter_items", id)
			if ferr != nil {
				return ferr
			}
			other.Set("enabled", false)
			if ferr := txApp.Save(other); ferr != nil {
				return ferr
			}
		}
		return nil
	})
	if err != nil {
		return e.InternalServerError("failed to save charter items", err)
	}

	autoDisabledRecs := make([]*core.Record, 0, len(autoDisabledIDs))
	for _, id := range autoDisabledIDs {
		rec, ferr := e.App.FindRecordById("charter_items", id)
		if ferr != nil {
			return e.InternalServerError("failed to reload auto-disabled item", ferr)
		}
		autoDisabledRecs = append(autoDisabledRecs, rec)
	}

	return respondToggleResult(e, enabledTarget, autoDisabledRecs)
}

func respondToggleResult(e *core.RequestEvent, itemRec *core.Record, autoDisabledRecs []*core.Record) error {
	itemDTO, err := charterItemDTOWithConflicts(e.App, itemRec)
	if err != nil {
		return e.InternalServerError("failed to build response", err)
	}

	autoDisabled := make([]charterItemDTO, 0, len(autoDisabledRecs))
	for _, rec := range autoDisabledRecs {
		dto, derr := charterItemDTOWithConflicts(e.App, rec)
		if derr != nil {
			return e.InternalServerError("failed to build response", derr)
		}
		autoDisabled = append(autoDisabled, dto)
	}

	return e.JSON(http.StatusOK, toggleResultDTO{Item: itemDTO, AutoDisabled: autoDisabled})
}
