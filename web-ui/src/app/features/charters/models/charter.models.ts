/** Charters Management domain models — mirrors kitty-specs/charters-management-01M0824T/contracts/charters-api.yaml */

import type { ArtifactType, ValidationStatus } from '../../packs/models';

/** Reuse the packs domain's artifact kind union — the OpenAPI contract's `artifact_type` enum is identical. */
export type ArtifactKind = ArtifactType;

export interface Charter {
  id: string;
  name: string;
  active: boolean;
  created: string;
  updated: string;
}

/** Response shape of every mutating `/api/charters/*` route plus `GET /api/charters/summaries`. */
export interface CharterSummary {
  id: string;
  name: string;
  active: boolean;
  enabled_item_count?: number;
  has_conflicts?: boolean;
  created: string;
  updated: string;
}

export interface CharterItem {
  id: string;
  charter: string;
  pack_artifact?: string | null;
  pack_name: string;
  artifact_type: ArtifactKind;
  artifact_id: string;
  artifact_name: string;
  enabled: boolean;
  conflicting_item_ids?: string[];
  missing_source?: boolean;
}

export interface ToggleResult {
  item: CharterItem;
  auto_disabled: CharterItem[];
}

export interface CharterGridCard {
  artifact_type: ArtifactKind;
  artifact_id: string;
  artifact_name: string;
  pack_name: string;
  /** Present only when in_charter is true. */
  charter_item_id?: string | null;
  /** The `pack_artifacts` record id — the value to pass as `AddItemRequest.pack_artifact_id`. Absent only for missing-source cards. */
  pack_artifact_id?: string;
  in_charter: boolean;
  /** Meaningless (false) when in_charter is false. */
  enabled: boolean;
  conflicting: boolean;
  missing_source: boolean;
}

/** Full library grid for a charter, grouped by artifact kind — always has all 9 keys. */
export type CharterGrid = Record<ArtifactKind, CharterGridCard[]>;

export interface CharterApiErrorBody {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface CharterExportResult {
  blob: Blob;
  filename: string | null;
  validationStatus: ValidationStatus | null;
  validationErrors: unknown | null;
}

export interface CreateCharterRequest {
  name: string;
}

export interface RenameCharterRequest {
  name: string;
}

export interface AddItemRequest {
  pack_artifact_id: string;
}

export interface AddItemsBulkRequest {
  pack_artifact_ids: string[];
}

/** The directive artifact the maintainer clicked "Add to Charter" on. */
export interface RelatedItemsTarget {
  pack_artifact_id: string;
  artifact_type: ArtifactKind;
  artifact_id: string;
  name: string;
}

/** An artifact whose own `references` field points back at a `RelatedItemsTarget` directive (FR-026). */
export interface RelatedItemCandidate {
  pack_artifact_id: string;
  artifact_type: ArtifactKind;
  artifact_id: string;
  name: string;
  pack_name: string;
  already_in_charter: boolean;
}

export interface RelatedItemsResult {
  target: RelatedItemsTarget;
  related: RelatedItemCandidate[];
}

export interface BulkAddResult {
  items: CharterItem[];
  added_count: number;
  already_present_count: number;
}

export interface CharterListFilters {
  name?: string;
  active?: boolean;
}
