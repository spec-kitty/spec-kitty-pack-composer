package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/spec-kitty/pack-composer/server/pack"
)

// parentStatusDTO matches contracts/pack-inheritance-api.yaml ParentStatus.
// Defined locally (rather than serializing pack.ParentStatus directly) so
// this package's JSON shape doesn't drift silently if the internal type's
// field names ever change.
type parentStatusDTO struct {
	Status         string `json:"status"`
	BrokenRef      string `json:"broken_ref,omitempty"`
	BrokenPackName string `json:"broken_pack_name,omitempty"`
}

func toParentStatusDTO(ps pack.ParentStatus) parentStatusDTO {
	return parentStatusDTO{
		Status:         string(ps.Status),
		BrokenRef:      ps.BrokenRef,
		BrokenPackName: ps.BrokenPackName,
	}
}

// resolvedArtifactDTO matches contracts/pack-inheritance-api.yaml ResolvedArtifact.
type resolvedArtifactDTO struct {
	ArtifactType   string         `json:"artifact_type"`
	ArtifactID     string         `json:"artifact_id"`
	Name           string         `json:"name"`
	Category       string         `json:"category,omitempty"`
	Origin         string         `json:"origin"`
	SourcePackID   string         `json:"source_pack_id,omitempty"`
	SourcePackName string         `json:"source_pack_name,omitempty"`
	Roles          []string       `json:"roles,omitempty"`
	DomainKeywords []string       `json:"domain_keywords,omitempty"`
	Content        map[string]any `json:"content"`
}

func toResolvedArtifactDTO(a pack.ResolvedArtifact) resolvedArtifactDTO {
	return resolvedArtifactDTO{
		ArtifactType:   string(a.ArtifactType),
		ArtifactID:     a.ArtifactID,
		Name:           a.Name,
		Category:       a.Category,
		Origin:         string(a.Origin),
		SourcePackID:   a.SourcePackID,
		SourcePackName: a.SourcePackName,
		Roles:          a.Roles,
		DomainKeywords: a.DomainKeywords,
		Content:        a.Content,
	}
}

// resolvedPackDTO matches contracts/pack-inheritance-api.yaml ResolvedPack.
type resolvedPackDTO struct {
	PackID    string                `json:"pack_id"`
	Status    parentStatusDTO       `json:"status"`
	Artifacts []resolvedArtifactDTO `json:"artifacts"`
}

// loadPackNodes maps every packs record into a pack.PackNode for the
// resolver. Single FindAllRecords call, no per-pack I/O.
func loadPackNodes(app core.App) ([]pack.PackNode, error) {
	recs, err := app.FindAllRecords("packs")
	if err != nil {
		return nil, err
	}
	nodes := make([]pack.PackNode, 0, len(recs))
	for _, rec := range recs {
		nodes = append(nodes, pack.PackNode{
			ID:         rec.Id,
			ProjectKey: rec.GetString("project_key"),
			ParentID:   rec.GetString("parent_id"),
			Origin:     rec.GetString("origin"),
			Name:       rec.GetString("name"),
		})
	}
	return nodes, nil
}

// loadArtifactsByPackID loads every pack_artifacts record and groups it by
// its owning pack id. Single FindAllRecords call, acceptable full-table read
// at this project's documented scale (see WP06 risk notes).
func loadArtifactsByPackID(app core.App) (map[string][]pack.ParsedArtifact, error) {
	recs, err := app.FindAllRecords("pack_artifacts")
	if err != nil {
		return nil, err
	}
	byPack := make(map[string][]pack.ParsedArtifact, len(recs))
	for _, rec := range recs {
		packID := rec.GetString("pack")
		byPack[packID] = append(byPack[packID], parsedArtifactFromRecord(rec))
	}
	return byPack, nil
}

func parsedArtifactFromRecord(rec *core.Record) pack.ParsedArtifact {
	return pack.ParsedArtifact{
		ArtifactType:       pack.ArtifactType(rec.GetString("artifact_type")),
		ArtifactID:         rec.GetString("artifact_id"),
		Name:               rec.GetString("name"),
		Category:           rec.GetString("category"),
		Roles:              rec.GetStringSlice("roles"),
		DomainKeywords:     rec.GetStringSlice("domain_keywords"),
		ParseOK:            rec.GetBool("parse_ok"),
		ParseError:         rec.GetString("parse_error"),
		Content:            contentFromRecord(rec),
		SourceRelativePath: rec.GetString("source_relative_path"),
	}
}

// contentFromRecord decodes the JSONField "content" column back into a
// map[string]any for re-serialization.
func contentFromRecord(rec *core.Record) map[string]any {
	raw, ok := rec.Get("content").(types.JSONRaw)
	if !ok || len(raw) == 0 {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	return m
}

// getParentStatus handles GET /api/packs/parent-status.
func getParentStatus(e *core.RequestEvent) error {
	nodes, err := loadPackNodes(e.App)
	if err != nil {
		return e.InternalServerError("failed to load packs", err)
	}

	statuses := pack.ResolveStatus(nodes)
	out := make(map[string]parentStatusDTO, len(statuses))
	for id, ps := range statuses {
		out[id] = toParentStatusDTO(ps)
	}

	return e.JSON(http.StatusOK, out)
}

// getPackResolved handles GET /api/packs/{packId}/resolved.
func getPackResolved(e *core.RequestEvent) error {
	packID := e.Request.PathValue("packId")

	rec, err := findPackByID(e.App, packID)
	if err != nil {
		return e.InternalServerError("failed to load pack", err)
	}
	if rec == nil {
		return notFound(e, "pack not found")
	}

	nodes, err := loadPackNodes(e.App)
	if err != nil {
		return e.InternalServerError("failed to load packs", err)
	}

	artifactsByPackID, err := loadArtifactsByPackID(e.App)
	if err != nil {
		return e.InternalServerError("failed to load pack artifacts", err)
	}

	artifacts, status := pack.ResolveEffectiveArtifacts(packID, nodes, artifactsByPackID)

	dto := resolvedPackDTO{
		PackID:    packID,
		Status:    toParentStatusDTO(status),
		Artifacts: make([]resolvedArtifactDTO, 0, len(artifacts)),
	}
	for _, a := range artifacts {
		dto.Artifacts = append(dto.Artifacts, toResolvedArtifactDTO(a))
	}

	return e.JSON(http.StatusOK, dto)
}
