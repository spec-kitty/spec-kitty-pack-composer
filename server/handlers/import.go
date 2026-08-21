package handlers

import (
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type importRequest struct {
	SourcePath string `json:"source_path"`
}

// importPack handles POST /api/packs/import.
//
// Duplicate identity (research R8): when a pack with the same absolute
// source_path already exists, this handler upserts/refreshes that record
// instead of creating a duplicate or returning 409.
func importPack(e *core.RequestEvent) error {
	var req importRequest
	if err := e.BindBody(&req); err != nil {
		return badRequest(e, "invalid request body", "invalid_body")
	}
	req.SourcePath = strings.TrimSpace(req.SourcePath)
	if req.SourcePath == "" {
		return badRequest(e, "source_path is required", "missing_source_path")
	}

	sp, err := loadPackFromDisk(req.SourcePath, true)
	if err != nil {
		if errors.Is(err, ErrNoArtifacts) {
			return badRequest(e, "no recognizable artifacts found at source_path", "no_artifacts")
		}
		if os.IsNotExist(err) {
			return badRequest(e, "source_path does not exist or is not readable", "path_unreadable")
		}
		return badRequest(e, err.Error(), "path_unreadable")
	}

	existing, err := findPackBySourcePath(e.App, sp.Root)
	if err != nil {
		return e.InternalServerError("failed to look up pack by source_path", err)
	}

	// Prefer refresh semantics for existing path (R8).
	historySource := historySourceImport
	if existing != nil {
		historySource = historySourceRefresh
	}

	rec, err := persistScannedPack(e.App, existing, sp, historySource)
	if err != nil {
		return e.InternalServerError("failed to persist pack", err)
	}

	return e.JSON(http.StatusOK, packSummaryFromRecord(rec))
}
