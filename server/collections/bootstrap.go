package collections

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/spec-kitty/pack-composer/server/pack"
)

// publicRule opens a collection to unauthenticated local use (C-003: no auth this mission).
var publicRule = types.Pointer("")

// Bootstrap ensures packs, pack_artifacts, pack_version_history, charters, and
// charter_items collections exist with fields matching
// kitty-specs/pack-management-01KZV7CG/data-model.md and
// kitty-specs/charters-management-01M0824T/data-model.md.
func Bootstrap(app core.App) error {
	packs, err := ensurePacks(app)
	if err != nil {
		return fmt.Errorf("bootstrap packs: %w", err)
	}

	if err := ensurePackArtifacts(app, packs); err != nil {
		return fmt.Errorf("bootstrap pack_artifacts: %w", err)
	}

	if err := ensurePackVersionHistory(app, packs); err != nil {
		return fmt.Errorf("bootstrap pack_version_history: %w", err)
	}

	charters, err := ensureCharters(app)
	if err != nil {
		return fmt.Errorf("bootstrap charters: %w", err)
	}

	if err := ensureCharterItems(app, charters); err != nil {
		return fmt.Errorf("bootstrap charter_items: %w", err)
	}

	return nil
}

func ensurePacks(app core.App) (*core.Collection, error) {
	existing, err := app.FindCollectionByNameOrId("packs")
	if err == nil {
		if err := ensurePacksProjectKeyField(app, existing); err != nil {
			return nil, err
		}
		if err := ensurePacksParentIDField(app, existing); err != nil {
			return nil, err
		}
		if err := ensurePacksOriginBuiltinValue(app, existing); err != nil {
			return nil, err
		}
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	collection := core.NewBaseCollection("packs")
	openCollection(collection)

	collection.Fields.Add(&core.TextField{
		Name:     "name",
		Required: true,
	})
	collection.Fields.Add(&core.TextField{
		Name: "description",
	})
	collection.Fields.Add(&core.TextField{
		Name: "project_key",
	})
	collection.Fields.Add(&core.TextField{
		Name: "parent_id",
	})
	collection.Fields.Add(&core.TextField{
		Name:     "source_path",
		Required: true,
	})
	collection.Fields.Add(&core.SelectField{
		Name:      "origin",
		Required:  true,
		Values:    []string{"local", "remote", "built-in"},
		MaxSelect: 1,
	})
	collection.Fields.Add(&core.TextField{
		Name: "version",
	})
	collection.Fields.Add(&core.SelectField{
		Name:      "validation_status",
		Values:    []string{"valid", "errors", "unknown"},
		MaxSelect: 1,
	})
	collection.Fields.Add(&core.JSONField{
		Name: "validation_errors",
	})
	collection.Fields.Add(&core.DateField{
		Name:     "imported_at",
		Required: true,
	})
	collection.Fields.Add(&core.DateField{
		Name:     "updated_at",
		Required: true,
	})
	collection.Fields.Add(&core.JSONField{
		Name: "links",
	})
	collection.Fields.Add(&core.JSONField{
		Name: "stats",
	})
	collection.Fields.Add(&core.JSONField{
		Name: "raw_snapshot",
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "created",
		OnCreate: true,
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "updated",
		OnCreate: true,
		OnUpdate: true,
	})

	collection.AddIndex("idx_packs_source_path", true, "source_path", "")

	if err := app.Save(collection); err != nil {
		return nil, err
	}
	return collection, nil
}

// ensurePacksProjectKeyField adds project_key to an existing packs collection when missing.
func ensurePacksProjectKeyField(app core.App, collection *core.Collection) error {
	if collection.Fields.GetByName("project_key") != nil {
		return nil
	}
	collection.Fields.Add(&core.TextField{
		Name: "project_key",
	})
	return app.Save(collection)
}

// ensurePacksParentIDField adds parent_id to an existing packs collection when missing.
// Absence of a value means "no declared parent" — this is the common, valid case.
func ensurePacksParentIDField(app core.App, collection *core.Collection) error {
	if collection.Fields.GetByName("parent_id") != nil {
		return nil
	}
	collection.Fields.Add(&core.TextField{
		Name: "parent_id",
	})
	return app.Save(collection)
}

// ensurePacksOriginBuiltinValue appends "built-in" to an existing packs.origin
// select field's allowed values when not already present. Additive-only: never
// removes or reorders "local"/"remote", since existing records depend on them.
func ensurePacksOriginBuiltinValue(app core.App, collection *core.Collection) error {
	field, ok := collection.Fields.GetByName("origin").(*core.SelectField)
	if !ok || field == nil {
		return nil
	}
	for _, v := range field.Values {
		if v == "built-in" {
			return nil
		}
	}
	field.Values = append(field.Values, "built-in")
	return app.Save(collection)
}

// provenanceStatusField describes an artifact's relationship to an upstream
// document, which is a different question from whether its file on disk has
// changed. "authored" is the expected answer for hand-written doctrine and is
// not a defect; only "undeclared" is.
func provenanceStatusField() *core.SelectField {
	return &core.SelectField{
		Name: "provenance_status",
		Values: []string{
			string(pack.ProvenanceAuthored),
			string(pack.ProvenanceDeclared),
			string(pack.ProvenanceUndeclared),
		},
		MaxSelect: 1,
	}
}

// ensurePackArtifactsProvenanceFields adds the provenance fields to a
// pack_artifacts collection created before they existed. Records keep an empty
// status until their pack is next imported or refreshed, which is honest:
// nothing has read a sidecar for them yet.
func ensurePackArtifactsProvenanceFields(app core.App, collection *core.Collection) error {
	changed := false
	if collection.Fields.GetByName("provenance_status") == nil {
		collection.Fields.Add(provenanceStatusField())
		changed = true
	}
	if collection.Fields.GetByName("provenance") == nil {
		collection.Fields.Add(&core.JSONField{
			Name: "provenance",
		})
		changed = true
	}
	if !changed {
		return nil
	}
	return app.Save(collection)
}

func ensurePackArtifacts(app core.App, packs *core.Collection) error {
	existing, err := app.FindCollectionByNameOrId("pack_artifacts")
	if err == nil {
		return ensurePackArtifactsProvenanceFields(app, existing)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	collection := core.NewBaseCollection("pack_artifacts")
	openCollection(collection)

	collection.Fields.Add(&core.RelationField{
		Name:          "pack",
		Required:      true,
		CollectionId:  packs.Id,
		CascadeDelete: true,
		MaxSelect:     1,
	})
	collection.Fields.Add(&core.SelectField{
		Name:     "artifact_type",
		Required: true,
		Values: []string{
			"directive",
			"tactic",
			"procedure",
			"styleguide",
			"toolguide",
			"profile",
			"mission_step_contract",
			"template",
			"glossary",
		},
		MaxSelect: 1,
	})
	collection.Fields.Add(&core.TextField{
		Name:     "artifact_id",
		Required: true,
	})
	collection.Fields.Add(&core.TextField{
		Name:     "name",
		Required: true,
	})
	collection.Fields.Add(&core.TextField{
		Name: "category",
	})
	collection.Fields.Add(&core.JSONField{
		Name: "roles",
	})
	collection.Fields.Add(&core.JSONField{
		Name: "domain_keywords",
	})
	collection.Fields.Add(&core.BoolField{
		Name: "parse_ok",
	})
	collection.Fields.Add(&core.TextField{
		Name: "parse_error",
	})
	collection.Fields.Add(&core.JSONField{
		Name: "content",
	})
	collection.Fields.Add(&core.TextField{
		Name: "source_relative_path",
	})
	collection.Fields.Add(provenanceStatusField())
	collection.Fields.Add(&core.JSONField{
		Name: "provenance",
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "created",
		OnCreate: true,
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "updated",
		OnCreate: true,
		OnUpdate: true,
	})

	collection.AddIndex("idx_pack_artifacts_pack_path", true, "pack, source_relative_path", "")

	return app.Save(collection)
}

func ensurePackVersionHistory(app core.App, packs *core.Collection) error {
	_, err := app.FindCollectionByNameOrId("pack_version_history")
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	collection := core.NewBaseCollection("pack_version_history")
	openCollection(collection)

	collection.Fields.Add(&core.RelationField{
		Name:          "pack",
		Required:      true,
		CollectionId:  packs.Id,
		CascadeDelete: true,
		MaxSelect:     1,
	})
	collection.Fields.Add(&core.TextField{
		Name:     "version",
		Required: true,
	})
	collection.Fields.Add(&core.DateField{
		Name:     "observed_at",
		Required: true,
	})
	collection.Fields.Add(&core.SelectField{
		Name:      "source",
		Required:  true,
		Values:    []string{"import", "refresh"},
		MaxSelect: 1,
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "created",
		OnCreate: true,
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "updated",
		OnCreate: true,
		OnUpdate: true,
	})

	return app.Save(collection)
}

func ensureCharters(app core.App) (*core.Collection, error) {
	existing, err := app.FindCollectionByNameOrId("charters")
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	collection := core.NewBaseCollection("charters")
	openCollection(collection)

	collection.Fields.Add(&core.TextField{
		Name:     "name",
		Required: true,
	})
	collection.Fields.Add(&core.BoolField{
		Name: "active",
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "created",
		OnCreate: true,
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "updated",
		OnCreate: true,
		OnUpdate: true,
	})

	if err := app.Save(collection); err != nil {
		return nil, err
	}
	return collection, nil
}

func ensureCharterItems(app core.App, charters *core.Collection) error {
	_, err := app.FindCollectionByNameOrId("charter_items")
	if err == nil {
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	packArtifacts, err := app.FindCollectionByNameOrId("pack_artifacts")
	if err != nil {
		return err
	}

	collection := core.NewBaseCollection("charter_items")
	openCollection(collection)

	collection.Fields.Add(&core.RelationField{
		Name:          "charter",
		Required:      true,
		CollectionId:  charters.Id,
		CascadeDelete: true,
		MaxSelect:     1,
	})
	collection.Fields.Add(&core.RelationField{
		Name:         "pack_artifact",
		CollectionId: packArtifacts.Id,
		MaxSelect:    1,
	})
	collection.Fields.Add(&core.TextField{
		Name:     "pack_name",
		Required: true,
	})
	collection.Fields.Add(&core.SelectField{
		Name:     "artifact_type",
		Required: true,
		Values: []string{
			"directive",
			"tactic",
			"procedure",
			"styleguide",
			"toolguide",
			"profile",
			"mission_step_contract",
			"template",
			"glossary",
		},
		MaxSelect: 1,
	})
	collection.Fields.Add(&core.TextField{
		Name:     "artifact_id",
		Required: true,
	})
	collection.Fields.Add(&core.TextField{
		Name:     "artifact_name",
		Required: true,
	})
	collection.Fields.Add(&core.BoolField{
		Name: "enabled",
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "created",
		OnCreate: true,
	})
	collection.Fields.Add(&core.AutodateField{
		Name:     "updated",
		OnCreate: true,
		OnUpdate: true,
	})

	collection.AddIndex("idx_charter_items_identity", true, "charter, artifact_type, artifact_id, pack_name", "")

	return app.Save(collection)
}

func openCollection(c *core.Collection) {
	c.ListRule = publicRule
	c.ViewRule = publicRule
	c.CreateRule = publicRule
	c.UpdateRule = publicRule
	c.DeleteRule = publicRule
}
