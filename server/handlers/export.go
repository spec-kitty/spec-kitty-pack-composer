package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"github.com/spec-kitty/pack-composer/server/cli"
	"github.com/spec-kitty/pack-composer/server/pack"
)

// exportPack handles POST /api/packs/{packId}/export.
// Always returns a ZIP when the pack exists and zipping succeeds (FR-012),
// even if validation reports errors. Validation outcome is sent via headers.
func exportPack(e *core.RequestEvent) error {
	packID := e.Request.PathValue("packId")
	if packID == "" {
		return badRequest(e, "packId is required", "missing_pack_id")
	}

	if !defaultPackLocks.TryLock(packID) {
		return conflict(e, "refresh or export already in progress for this pack", "pack_busy")
	}
	defer defaultPackLocks.Unlock(packID)

	rec, err := findPackByID(e.App, packID)
	if err != nil {
		return e.InternalServerError("failed to load pack", err)
	}
	if rec == nil {
		return notFound(e, "pack not found")
	}

	sourcePath := rec.GetString("source_path")

	validation, verr := cli.ValidatePack(sourcePath)
	if verr != nil {
		if errors.Is(verr, cli.ErrCLINotInstalled) {
			return serviceUnavailable(e,
				"Spec Kitty CLI is not installed or not on PATH",
				"cli_missing",
			)
		}
		return serviceUnavailable(e,
			fmt.Sprintf("Spec Kitty CLI failed to execute: %v", verr),
			"cli_failed",
		)
	}

	// Persist last validation outcome (optional model touch for badge freshness).
	rec.Set("validation_status", string(validation.Status))
	rec.Set("validation_errors", validation.Errors)
	if err := e.App.Save(rec); err != nil {
		return e.InternalServerError("failed to update validation status", err)
	}

	zipBytes, err := pack.ZipPack(sourcePath)
	if err != nil {
		return e.InternalServerError("failed to zip pack", err)
	}

	filename := exportFilename(rec.GetString("name"), rec.GetString("version"))
	e.Response.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	e.Response.Header().Set("X-Pack-Validation-Status", string(validation.Status))
	if validation.Status == cli.StatusErrors && len(validation.Errors) > 0 {
		if raw, err := json.Marshal(validation.Errors); err == nil {
			e.Response.Header().Set("X-Pack-Validation-Errors", string(raw))
		}
	}

	return e.Blob(http.StatusOK, "application/zip", zipBytes)
}

func exportFilename(name, version string) string {
	safe := sanitizeFilename(name)
	if safe == "" {
		safe = "pack"
	}
	if version != "" {
		return fmt.Sprintf("%s-%s.zip", safe, sanitizeFilename(version))
	}
	return safe + ".zip"
}

func sanitizeFilename(s string) string {
	s = strings.TrimSpace(s)
	replacer := strings.NewReplacer(
		"/", "-", "\\", "-", ":", "-", "*", "-", "?", "-",
		"\"", "", "<", "", ">", "", "|", "-", " ", "-",
	)
	return replacer.Replace(s)
}
