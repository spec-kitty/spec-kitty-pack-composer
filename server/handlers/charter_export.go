package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"github.com/spec-kitty/pack-composer/server/charter"
	"github.com/spec-kitty/pack-composer/server/cli"
)

// zeroItemsWarning is prepended to X-Charter-Validation-Errors when a
// charter has no enabled items — the real spec-kitty CLI has no concept
// of "empty selection" and stays silent about it, so this WP surfaces its
// own client-facing hint per spec.md's "minimal/empty bundle plus a clear
// warning" edge case.
const zeroItemsWarning = "no items are currently enabled in this charter; the exported bundle is a minimal, valid placeholder"

// exportCharter handles POST /api/charters/{charterId}/export.
//
// Always returns a ZIP when the charter exists, the CLI is installed, and
// zipping succeeds (FR-018), even when validation reports errors —
// validation outcome is surfaced via response headers, mirroring
// exportPack's contract. Only a missing git/spec-kitty binary blocks the
// download (503).
func exportCharter(e *core.RequestEvent) error {
	charterID := e.Request.PathValue("charterId")
	if charterID == "" {
		return badRequest(e, "charterId is required", "missing_charter_id")
	}

	if !defaultCharterLocks.TryLock(charterID) {
		return conflict(e, "export already in progress for this charter", "charter_busy")
	}
	defer defaultCharterLocks.Unlock(charterID)

	charterRec, err := findCharterByID(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter", err)
	}
	if charterRec == nil {
		return notFound(e, "charter not found")
	}

	items, err := loadEnabledBundleItems(e.App, charterID)
	if err != nil {
		return e.InternalServerError("failed to load charter items", err)
	}

	bundle, err := charter.AssembleBundle(charterRec.GetString("name"), items, time.Now().UTC())
	if err != nil {
		return e.InternalServerError("failed to assemble charter bundle", err)
	}

	validation, verr := cli.ValidateCharterBundle(bundle)
	if verr != nil {
		if errors.Is(verr, cli.ErrCLINotInstalled) || errors.Is(verr, cli.ErrGitNotInstalled) {
			return serviceUnavailable(e,
				fmt.Sprintf("Spec Kitty CLI validation is unavailable: %v", verr),
				"cli_missing",
			)
		}
		return serviceUnavailable(e,
			fmt.Sprintf("Spec Kitty CLI failed to execute: %v", verr),
			"cli_failed",
		)
	}

	zipBytes, err := charter.ZipBundle(bundle)
	if err != nil {
		return e.InternalServerError("failed to zip charter bundle", err)
	}

	headerErrors := append([]string{}, validation.Errors...)
	if len(items) == 0 {
		headerErrors = append([]string{zeroItemsWarning}, headerErrors...)
	}

	filename := charterExportFilename(charterRec.GetString("name"))
	e.Response.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	e.Response.Header().Set("X-Charter-Validation-Status", string(validation.Status))
	if len(headerErrors) > 0 {
		if raw, merr := json.Marshal(headerErrors); merr == nil {
			e.Response.Header().Set("X-Charter-Validation-Errors", string(raw))
		}
	}

	return e.Blob(http.StatusOK, "application/zip", zipBytes)
}

func charterExportFilename(name string) string {
	safe := sanitizeFilename(name)
	if safe == "" {
		safe = "charter"
	}
	return fmt.Sprintf("%s-charter-bundle.zip", safe)
}

// loadEnabledBundleItems loads charterID's enabled, non-missing-source
// items and resolves each one's pack_artifact content for bundle
// assembly. FR-022: a missing-source item's stored enabled flag is not
// trustworthy, so it is always excluded here regardless of its stored
// value. WP03's conflict-group invariant means "enabled" already implies
// "the winning side of any live conflict" — no extra filtering needed.
func loadEnabledBundleItems(app core.App, charterID string) ([]charter.BundleItem, error) {
	recs, err := loadCharterItems(app, charterID)
	if err != nil {
		return nil, err
	}

	items := make([]charter.BundleItem, 0, len(recs))
	for _, rec := range recs {
		if !rec.GetBool("enabled") {
			continue
		}
		if isMissingSource(app, rec) {
			continue
		}

		var content map[string]any
		if artifactID := rec.GetString("pack_artifact"); artifactID != "" {
			if artifactRec, aerr := app.FindRecordById("pack_artifacts", artifactID); aerr == nil {
				content = contentFromRecord(artifactRec)
			}
		}

		items = append(items, charter.BundleItem{
			ArtifactType: rec.GetString("artifact_type"),
			ArtifactID:   rec.GetString("artifact_id"),
			ArtifactName: rec.GetString("artifact_name"),
			Content:      content,
		})
	}
	return items, nil
}
