package handlers

import (
	"errors"
	"net/http"
	"os"

	"github.com/pocketbase/pocketbase/core"

	"github.com/spec-kitty/pack-composer/server/pack/builtin"
)

// refreshPack handles POST /api/packs/{packId}/refresh.
func refreshPack(e *core.RequestEvent) error {
	packID := e.Request.PathValue("packId")
	if packID == "" {
		return badRequest(e, "packId is required", "missing_pack_id")
	}

	if !defaultPackLocks.TryLock(packID) {
		return conflict(e, "refresh or export already in progress for this pack", "pack_busy")
	}
	defer defaultPackLocks.Unlock(packID)

	existing, err := findPackByID(e.App, packID)
	if err != nil {
		return e.InternalServerError("failed to load pack", err)
	}
	if existing == nil {
		return notFound(e, "pack not found")
	}

	// The built-in pack's source_path is the installed spec-kitty doctrine
	// package directory — a display-only breadcrumb, not a pack root to
	// re-scan generically. Re-scanning it via loadPackFromDisk would pick
	// up every file under that directory (including templates/glossary,
	// which built-in sourcing deliberately excludes) and run pack-shaped
	// validation against content that was never structured as a pack,
	// producing spurious duplicate-id/validation errors. Refreshing the
	// built-in pack instead re-runs the same hybrid CLI-JSON + file-scan
	// sourcing used at server bootstrap (see server/pack/builtin).
	if existing.GetString("origin") == "built-in" {
		if err := builtin.Bootstrap(e.App); err != nil {
			return e.InternalServerError("failed to refresh built-in pack", err)
		}
		rec, err := findPackByID(e.App, packID)
		if err != nil {
			return e.InternalServerError("failed to load pack", err)
		}
		return e.JSON(http.StatusOK, packSummaryFromRecord(rec))
	}

	sourcePath := existing.GetString("source_path")
	sp, err := loadPackFromDisk(sourcePath, true)
	if err != nil {
		if errors.Is(err, ErrNoArtifacts) {
			return badRequest(e, "no recognizable artifacts found at source_path", "no_artifacts")
		}
		if os.IsNotExist(err) {
			return badRequest(e, "source path no longer readable", "path_unreadable")
		}
		return badRequest(e, err.Error(), "path_unreadable")
	}

	rec, err := persistScannedPack(e.App, existing, sp, historySourceRefresh)
	if err != nil {
		return e.InternalServerError("failed to refresh pack", err)
	}

	return e.JSON(http.StatusOK, packSummaryFromRecord(rec))
}
