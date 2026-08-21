package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// charterNameRequest is the shared request body shape for create/rename
// (matches CreateCharterRequest/RenameCharterRequest in charters-api.yaml,
// which are structurally identical: {name string}).
type charterNameRequest struct {
	Name string `json:"name"`
}

// CharterSummary matches contracts/charters-api.yaml CharterSummary schema.
//
// GET /api/charters/summaries is an intentional addition beyond the frozen
// contract (see WP02 task doc): the contract defines the CharterSummary
// schema but has no dedicated list endpoint, so this route/DTO fills that
// gap for the overview page (WP09) without an N+1 client-side join.
type CharterSummary struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Active           bool   `json:"active"`
	EnabledItemCount int    `json:"enabled_item_count"`
	HasConflicts     bool   `json:"has_conflicts"`
	Created          string `json:"created"`
	Updated          string `json:"updated"`
}

func charterSummaryFromRecord(rec *core.Record, enabledItemCount int, hasConflicts bool) CharterSummary {
	return CharterSummary{
		ID:               rec.Id,
		Name:             rec.GetString("name"),
		Active:           rec.GetBool("active"),
		EnabledItemCount: enabledItemCount,
		HasConflicts:     hasConflicts,
		Created:          rec.GetDateTime("created").String(),
		Updated:          rec.GetDateTime("updated").String(),
	}
}

func findCharterByID(app core.App, id string) (*core.Record, error) {
	rec, err := app.FindRecordById("charters", id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return rec, nil
}

// deactivateCurrentActiveCharter unsets active=true on whichever charters row
// currently has it, if any. Callers must invoke this inside the same
// app.RunInTransaction as the subsequent set-active write (research.md R1's
// "unset then set, same handler, same transaction" decision) so a mid-way
// crash never leaves two rows active or a temporarily-inconsistent state.
func deactivateCurrentActiveCharter(txApp core.App) error {
	current, err := txApp.FindFirstRecordByFilter("charters", "active=true", nil)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	current.Set("active", false)
	return txApp.Save(current)
}

// isMissingSourceItem mirrors the "is this item missing-source" check
// WP03/WP04 also need. A charter_item with no pack_artifact relation no
// longer resolves to a real artifact, so it doesn't count toward the
// effective enabled set (FR-022) regardless of its stored enabled flag.
// This is an inline, summary-only approximation; the fuller check that
// cross-references pack_artifacts for artifacts removed from their pack
// belongs to WP04's grid route.
func isMissingSourceItem(rec *core.Record) bool {
	return rec.GetString("pack_artifact") == ""
}

// countEffectiveEnabled returns the count of items that are both stored
// enabled=true and not missing-source (FR-022).
func countEffectiveEnabled(items []*core.Record) int {
	count := 0
	for _, item := range items {
		if item.GetBool("enabled") && !isMissingSourceItem(item) {
			count++
		}
	}
	return count
}

// hasAnyConflictGroup reports whether items contains two or more entries
// sharing the same (artifact_type, artifact_id) identity but originating
// from different packs. This is a narrower, summary-only duplicate of the
// conflict-detection logic WP03 will centralize in server/charter/conflict.go
// — do not treat this as the source of truth once that package exists.
func hasAnyConflictGroup(items []*core.Record) bool {
	type identity struct {
		artifactType string
		artifactID   string
	}
	packsByIdentity := map[identity]map[string]struct{}{}
	for _, item := range items {
		key := identity{
			artifactType: item.GetString("artifact_type"),
			artifactID:   item.GetString("artifact_id"),
		}
		packs, ok := packsByIdentity[key]
		if !ok {
			packs = map[string]struct{}{}
			packsByIdentity[key] = packs
		}
		packs[item.GetString("pack_name")] = struct{}{}
		if len(packs) > 1 {
			return true
		}
	}
	return false
}

// computeCharterSummary loads a single charter's items and derives its
// enabled_item_count/has_conflicts fields. Only used for single-charter
// mutation responses (create/activate/rename); the list route below avoids
// this per-charter query pattern by loading all charter_items once.
func computeCharterSummary(app core.App, rec *core.Record) (CharterSummary, error) {
	items, err := app.FindRecordsByFilter(
		"charter_items",
		"charter={:charter}",
		"",
		0,
		0,
		dbx.Params{"charter": rec.Id},
	)
	if err != nil {
		return CharterSummary{}, err
	}
	return charterSummaryFromRecord(rec, countEffectiveEnabled(items), hasAnyConflictGroup(items)), nil
}

// createCharter handles POST /api/charters.
// FR-002: creates a charter and makes it active, deactivating whichever was
// active, inside a single transaction.
func createCharter(e *core.RequestEvent) error {
	var req charterNameRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", "invalid_body")
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return badRequest(e, "name is required", "missing_name")
	}

	col, err := e.App.FindCollectionByNameOrId("charters")
	if err != nil {
		return e.InternalServerError("failed to load charters collection", err)
	}

	var rec *core.Record
	err = e.App.RunInTransaction(func(txApp core.App) error {
		if err := deactivateCurrentActiveCharter(txApp); err != nil {
			return err
		}
		rec = core.NewRecord(col)
		rec.Set("name", req.Name)
		rec.Set("active", true)
		return txApp.Save(rec)
	})
	if err != nil {
		return e.InternalServerError("failed to create charter", err)
	}

	// Brand-new charter: no items exist yet, so no query is needed.
	return e.JSON(http.StatusOK, charterSummaryFromRecord(rec, 0, false))
}

// activateCharter handles POST /api/charters/{charterId}/activate.
// FR-006: makes the target charter active, deactivating whichever was
// active, inside a single transaction. Idempotent when the target is
// already active.
func activateCharter(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")
	rec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if rec == nil {
		return notFound(e, "charter not found")
	}

	if rec.GetBool("active") {
		summary, err := computeCharterSummary(e.App, rec)
		if err != nil {
			return e.InternalServerError("failed to compute charter summary", err)
		}
		return e.JSON(http.StatusOK, summary)
	}

	err = e.App.RunInTransaction(func(txApp core.App) error {
		if err := deactivateCurrentActiveCharter(txApp); err != nil {
			return err
		}
		fresh, err := txApp.FindRecordById("charters", rec.Id)
		if err != nil {
			return err
		}
		fresh.Set("active", true)
		if err := txApp.Save(fresh); err != nil {
			return err
		}
		rec = fresh
		return nil
	})
	if err != nil {
		return e.InternalServerError("failed to activate charter", err)
	}

	summary, err := computeCharterSummary(e.App, rec)
	if err != nil {
		return e.InternalServerError("failed to compute charter summary", err)
	}
	return e.JSON(http.StatusOK, summary)
}

// renameCharter handles PATCH /api/charters/{charterId}.
// FR-023: single-field write, no transaction needed.
func renameCharter(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")
	rec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if rec == nil {
		return notFound(e, "charter not found")
	}

	var req charterNameRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", "invalid_body")
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return badRequest(e, "name is required", "missing_name")
	}

	rec.Set("name", req.Name)
	if err := e.App.Save(rec); err != nil {
		return e.InternalServerError("failed to rename charter", err)
	}

	summary, err := computeCharterSummary(e.App, rec)
	if err != nil {
		return e.InternalServerError("failed to compute charter summary", err)
	}
	return e.JSON(http.StatusOK, summary)
}

// deleteCharter handles DELETE /api/charters/{charterId}.
// FR-005: deletes a charter and its items (cascade via charter_items.charter
// CascadeDelete). Deliberately does not reactivate another charter if the
// deleted one was active — per FR-005's edge case, that must leave zero
// charters active.
func deleteCharter(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")
	rec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if rec == nil {
		return notFound(e, "charter not found")
	}

	if err := e.App.Delete(rec); err != nil {
		return e.InternalServerError("failed to delete charter", err)
	}

	return e.NoContent(http.StatusNoContent)
}

// getCharterSummaries handles GET /api/charters/summaries.
// FR-003/FR-004: the overview table's list data, computed server-side to
// avoid an N+1 client join. Loads charters and charter_items each exactly
// once, then groups items by charter id in memory.
func getCharterSummaries(e *core.RequestEvent) error {
	charters, err := e.App.FindAllRecords("charters")
	if err != nil {
		return e.InternalServerError("failed to load charters", err)
	}
	allItems, err := e.App.FindAllRecords("charter_items")
	if err != nil {
		return e.InternalServerError("failed to load charter items", err)
	}

	itemsByCharter := map[string][]*core.Record{}
	for _, item := range allItems {
		charterID := item.GetString("charter")
		itemsByCharter[charterID] = append(itemsByCharter[charterID], item)
	}

	summaries := make([]CharterSummary, 0, len(charters))
	for _, rec := range charters {
		items := itemsByCharter[rec.Id]
		summaries = append(summaries, charterSummaryFromRecord(
			rec,
			countEffectiveEnabled(items),
			hasAnyConflictGroup(items),
		))
	}

	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].Updated > summaries[j].Updated
	})

	return e.JSON(http.StatusOK, summaries)
}
