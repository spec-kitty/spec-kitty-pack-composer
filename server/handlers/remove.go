package handlers

import (
	"net/http"
	"os"

	"github.com/pocketbase/pocketbase/core"
)

type removeRequest struct {
	DeleteFiles bool `json:"delete_files"`
}

// removePack handles DELETE /api/packs/{packId}.
// Optional delete_files only applies when origin=local; non-local → 400.
// Disk delete runs only after a successful DB delete; missing path is a no-op.
func removePack(e *core.RequestEvent) error {
	packID := e.Request.PathValue("packId")
	if packID == "" {
		return badRequest(e, "packId is required", "missing_pack_id")
	}

	var req removeRequest
	// Body is optional; empty body leaves DeleteFiles=false.
	_ = e.BindBody(&req)

	rec, err := findPackByID(e.App, packID)
	if err != nil {
		return e.InternalServerError("failed to load pack", err)
	}
	if rec == nil {
		return notFound(e, "pack not found")
	}

	origin := rec.GetString("origin")
	sourcePath := rec.GetString("source_path")

	if origin == "built-in" {
		return badRequest(e, "the built-in pack cannot be removed", "builtin_not_removable")
	}

	if req.DeleteFiles && origin != "local" {
		return badRequest(e,
			"delete_files is only allowed for packs with origin=local",
			"delete_files_not_local",
		)
	}

	if err := e.App.Delete(rec); err != nil {
		return e.InternalServerError("failed to delete pack", err)
	}

	if req.DeleteFiles && origin == "local" && sourcePath != "" {
		// Missing path is a successful no-op (toggle still satisfied after DB delete).
		_ = os.RemoveAll(sourcePath)
	}

	return e.NoContent(http.StatusNoContent)
}
