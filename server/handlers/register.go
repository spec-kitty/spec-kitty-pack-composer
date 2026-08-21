package handlers

import "github.com/pocketbase/pocketbase/core"

// Register attaches custom pack-mutating routes under /api/packs
// matching kitty-specs/pack-management-01KZV7CG/contracts/packs-api.yaml,
// plus charter CRUD/summary routes under /api/charters matching
// kitty-specs/charters-management-01M0824T/contracts/charters-api.yaml
// (GET /api/charters/summaries is a documented addition beyond that
// contract — see server/handlers/charters.go).
// Replaces the WP01 no-op stub; main.go already invokes handlers.Register(e).
func Register(e *core.ServeEvent) {
	e.Router.POST("/api/packs/import", importPack)
	e.Router.POST("/api/packs/{packId}/refresh", refreshPack)
	e.Router.POST("/api/packs/{packId}/export", exportPack)
	e.Router.DELETE("/api/packs/{packId}", removePack)
	e.Router.GET("/api/packs/parent-status", getParentStatus)
	e.Router.GET("/api/packs/{packId}/resolved", getPackResolved)

	e.Router.GET("/api/charters/summaries", getCharterSummaries)
	e.Router.POST("/api/charters", createCharter)
	e.Router.POST("/api/charters/import", importCharter)
	e.Router.POST("/api/charters/{charterId}/activate", activateCharter)
	e.Router.PATCH("/api/charters/{charterId}", renameCharter)
	e.Router.DELETE("/api/charters/{charterId}", deleteCharter)

	// WP03: charter_items conflict-group-aware mutation routes.
	e.Router.POST("/api/charters/{charterId}/items", addCharterItem)
	e.Router.DELETE("/api/charters/{charterId}/items/{itemId}", removeCharterItem)
	e.Router.POST("/api/charters/{charterId}/items/{itemId}/toggle", toggleCharterItem)

	// Directive "add related items" flow: reverse-reference lookup plus a
	// bulk-add endpoint for confirmed items (see charter_related_items.go).
	e.Router.GET("/api/charters/{charterId}/items/related", getRelatedCharterItems)
	e.Router.POST("/api/charters/{charterId}/items/bulk", addCharterItemsBulk)

	// WP06: ephemeral-CLI-validated charter bundle export.
	e.Router.POST("/api/charters/{charterId}/export", exportCharter)

	// WP04: single-pass library grid read (all pack_artifacts joined with
	// this charter's charter_items, annotated with enabled/conflicting/
	// missing-source state).
	e.Router.GET("/api/charters/{charterId}/grid", getCharterGrid)
}
