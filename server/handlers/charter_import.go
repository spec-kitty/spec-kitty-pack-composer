package handlers

import (
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"github.com/spec-kitty/pack-composer/server/charter"
)

// maxBundleImportBytes bounds the uploaded bundle's raw body size. Real
// bundles are 4 small text files (charter.md, governance.yaml,
// directives.yaml, metadata.yaml) inside a zip, so this is a generous
// ceiling rather than a tuned limit.
const maxBundleImportBytes = 10 << 20 // 10 MiB

// missingSourcePackNamePlaceholder is the denormalized pack_name stored on
// an imported charter_item whose bundle reference didn't resolve against
// any currently-known pack_artifact. pack_name is a Required text field, so
// it cannot be left empty (unlike pack_artifact, which is an optional
// relation); this placeholder exists solely to satisfy that constraint
// while still being unambiguous to a human reading the raw record.
const missingSourcePackNamePlaceholder = "(missing source)"

// importCharter handles POST /api/charters/import.
//
// Ordering is the crux of FR-021: the uploaded bytes are validated as a
// structurally-sound bundle (charter.ValidateBundleStructure) and fully
// parsed (charter.ParseGovernanceSelections + charter.ResolveImportedItems)
// entirely in memory *before* any charters row is created. If validation or
// parsing fails, this handler returns 400 having touched the database not
// at all — see data-model.md's IC-06 risk note.
func importCharter(e *core.RequestEvent) error {
	e.Request.Body = http.MaxBytesReader(e.Response, e.Request.Body, maxBundleImportBytes)

	if err := e.Request.ParseMultipartForm(maxBundleImportBytes); err != nil {
		if err.Error() == "http: request body too large" {
			return badRequest(e, "bundle file is too large", "bundle_too_large")
		}
		return badRequest(e, "failed to parse multipart form", "invalid_body")
	}

	file, header, err := e.Request.FormFile("bundle")
	if err != nil {
		return badRequest(e, "bundle file is required", "missing_bundle")
	}
	defer file.Close()

	zipBytes, err := io.ReadAll(file)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return badRequest(e, "bundle file is too large", "bundle_too_large")
		}
		return e.InternalServerError("failed to read uploaded bundle", err)
	}

	parsed, err := charter.ValidateBundleStructure(zipBytes)
	if err != nil {
		return badRequest(e, err.Error(), "invalid_bundle")
	}

	selections, err := charter.ParseGovernanceSelections(parsed.GovernanceYAML)
	if err != nil {
		return badRequest(e, err.Error(), "invalid_bundle")
	}

	knownArtifacts, err := loadKnownArtifacts(e.App)
	if err != nil {
		return e.InternalServerError("failed to load pack artifacts", err)
	}
	importedItems := charter.ResolveImportedItems(selections, knownArtifacts)

	charterName := deriveImportedCharterName(parsed.CharterMD, header.Filename)

	chartersCol, err := e.App.FindCollectionByNameOrId("charters")
	if err != nil {
		return e.InternalServerError("failed to load charters collection", err)
	}
	itemsCol, err := e.App.FindCollectionByNameOrId("charter_items")
	if err != nil {
		return e.InternalServerError("failed to load charter_items collection", err)
	}

	var newCharter *core.Record
	err = e.App.RunInTransaction(func(txApp core.App) error {
		if err := deactivateCurrentActiveCharter(txApp); err != nil {
			return err
		}

		rec := core.NewRecord(chartersCol)
		rec.Set("name", charterName)
		rec.Set("active", true)
		if err := txApp.Save(rec); err != nil {
			return err
		}
		newCharter = rec

		for _, item := range importedItems {
			itemRec := core.NewRecord(itemsCol)
			itemRec.Set("charter", rec.Id)
			itemRec.Set("artifact_type", item.ArtifactType)
			itemRec.Set("artifact_id", item.ArtifactID)
			itemRec.Set("enabled", item.Enabled)
			if item.Matched {
				itemRec.Set("pack_artifact", item.PackArtifactID)
				itemRec.Set("pack_name", item.PackName)
				itemRec.Set("artifact_name", item.ArtifactName)
			} else {
				// Unmatched ("missing source") reference: no real pack_artifacts
				// row exists to relate to, so pack_artifact is left empty. This
				// is the same signal WP04's grid logic (isMissingSourceItem)
				// already reads for manually-added items whose source artifact
				// was later removed — an empty pack_artifact relation IS the
				// missing-source state, consistent with WP01's schema treating
				// pack_artifact as optional specifically for this scenario.
				// pack_name/artifact_name are Required text fields on
				// charter_items (see collections/bootstrap.go), so an empty
				// string isn't a valid placeholder here; use a value that
				// clearly signals "no real source pack" instead, and fall
				// back to the bundle's own artifact_id as the best available
				// label for artifact_name.
				itemRec.Set("pack_artifact", "")
				itemRec.Set("pack_name", missingSourcePackNamePlaceholder)
				itemRec.Set("artifact_name", item.ArtifactID)
			}
			if err := txApp.Save(itemRec); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return e.InternalServerError("failed to import charter", err)
	}

	summary, err := computeCharterSummary(e.App, newCharter)
	if err != nil {
		return e.InternalServerError("failed to compute charter summary", err)
	}
	return e.JSON(http.StatusOK, summary)
}

// loadKnownArtifacts loads every currently-imported pack_artifacts row
// (joined against packs for the denormalized pack name charter_items
// needs) in exactly two queries, mirroring WP04's single-FindAllRecords
// pattern for the grid route.
func loadKnownArtifacts(app core.App) ([]charter.KnownArtifact, error) {
	packRecords, err := app.FindAllRecords("packs")
	if err != nil {
		return nil, err
	}
	packNameByID := make(map[string]string, len(packRecords))
	for _, p := range packRecords {
		packNameByID[p.Id] = p.GetString("name")
	}

	artifactRecords, err := app.FindAllRecords("pack_artifacts")
	if err != nil {
		return nil, err
	}

	out := make([]charter.KnownArtifact, 0, len(artifactRecords))
	for _, rec := range artifactRecords {
		packID := rec.GetString("pack")
		out = append(out, charter.KnownArtifact{
			PackArtifactID: rec.Id,
			ArtifactType:   rec.GetString("artifact_type"),
			ArtifactID:     rec.GetString("artifact_id"),
			ArtifactName:   rec.GetString("name"),
			PackID:         packID,
			PackName:       packNameByID[packID],
		})
	}
	return out, nil
}

// deriveImportedCharterName picks a name for the new charter created by an
// import. The contract (POST /import) doesn't let the caller supply one, so
// this derives it from the bundle content: prefer the first "# " (H1-style)
// title line found in charter.md — WP05's BuildCharterMarkdown always
// starts the file with "# <charter name>", so a bundle produced by this
// app's own export round-trips its original name exactly. If no such line
// is found (e.g. a hand-edited or non-standard charter.md), fall back to a
// generic name that still identifies the uploaded file, or a plain generic
// name if even the filename is unavailable.
func deriveImportedCharterName(charterMD []byte, uploadedFilename string) string {
	for _, line := range strings.Split(string(charterMD), "\n") {
		trimmed := strings.TrimSpace(line)
		if title, ok := strings.CutPrefix(trimmed, "# "); ok {
			title = strings.TrimSpace(title)
			if title != "" {
				return title
			}
		}
	}
	uploadedFilename = strings.TrimSpace(uploadedFilename)
	if uploadedFilename != "" {
		return "Imported charter (" + uploadedFilename + ")"
	}
	return "Imported charter"
}
