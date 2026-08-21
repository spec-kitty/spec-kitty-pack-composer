package handlers

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
)

// PackSummary matches contracts/packs-api.yaml PackSummary.
type PackSummary struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Origin           string `json:"origin"`
	Version          string `json:"version,omitempty"`
	ValidationStatus string `json:"validation_status,omitempty"`
	ImportedAt       string `json:"imported_at"`
	UpdatedAt        string `json:"updated_at"`
	Stats            any    `json:"stats,omitempty"`
}

func packSummaryFromRecord(rec *core.Record) PackSummary {
	return PackSummary{
		ID:               rec.Id,
		Name:             rec.GetString("name"),
		Origin:           rec.GetString("origin"),
		Version:          rec.GetString("version"),
		ValidationStatus: rec.GetString("validation_status"),
		ImportedAt:       rec.GetDateTime("imported_at").String(),
		UpdatedAt:        rec.GetDateTime("updated_at").String(),
		Stats:            rec.Get("stats"),
	}
}

// ErrorBody matches contracts/packs-api.yaml ErrorBody (message required).
// Returned via e.JSON so intended codes (no_artifacts, cli_missing, pack_busy, …)
// reach the client without PocketBase ApiError safeErrorsData mangling.
type ErrorBody struct {
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
	Details any    `json:"details,omitempty"`
}

func respondError(e *core.RequestEvent, status int, message, code string) error {
	return e.JSON(status, ErrorBody{Message: message, Code: code})
}

func badRequest(e *core.RequestEvent, message, code string) error {
	return respondError(e, http.StatusBadRequest, message, code)
}

func notFound(e *core.RequestEvent, message string) error {
	return respondError(e, http.StatusNotFound, message, "not_found")
}

func conflict(e *core.RequestEvent, message, code string) error {
	return respondError(e, http.StatusConflict, message, code)
}

func serviceUnavailable(e *core.RequestEvent, message, code string) error {
	return respondError(e, http.StatusServiceUnavailable, message, code)
}
