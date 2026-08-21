/** Pack Management domain models — mirrors kitty-specs data-model.md */

export type PackOrigin = 'local' | 'remote' | 'built-in';

export type ValidationStatus = 'valid' | 'errors' | 'unknown';

export type ArtifactType =
  | 'directive'
  | 'tactic'
  | 'procedure'
  | 'styleguide'
  | 'toolguide'
  | 'profile'
  | 'mission_step_contract'
  | 'template'
  | 'glossary';

export type VersionHistorySource = 'import' | 'refresh';

export interface PackLink {
  label: string;
  url: string;
}

export interface PackStats {
  total: number;
  by_type: Partial<Record<ArtifactType, number>>;
}

export interface Pack {
  id: string;
  name: string;
  description?: string;
  /** Stable pack identity from org-charter.yaml `org_name`. */
  project_key?: string;
  source_path: string;
  origin: PackOrigin;
  /** Declared parent pack id, if any (empty/absent when the pack has no parent). */
  parent_id?: string;
  version: string;
  validation_status: ValidationStatus;
  validation_errors?: unknown;
  imported_at: string;
  updated_at: string;
  links: PackLink[];
  stats: PackStats;
  raw_snapshot: unknown;
  created?: string;
  updated?: string;
}

/** Subset returned by mutating `/api/packs/*` routes (OpenAPI PackSummary). */
export interface PackSummary {
  id: string;
  name: string;
  origin: PackOrigin;
  version?: string;
  validation_status?: ValidationStatus;
  imported_at: string;
  updated_at: string;
  stats?: Record<string, unknown>;
}

export interface PackArtifact {
  id: string;
  pack: string;
  artifact_type: ArtifactType;
  artifact_id: string;
  name: string;
  category?: string;
  roles?: string[];
  domain_keywords?: string[];
  parse_ok: boolean;
  parse_error?: string;
  content: unknown;
  source_relative_path: string;
  created?: string;
  updated?: string;
}

export interface PackVersionHistory {
  id: string;
  pack: string;
  version: string;
  observed_at: string;
  source: VersionHistorySource;
}

/** Pack parent-chain resolution outcome (contracts/pack-inheritance-api.yaml ParentStatus). */
export type ParentChainStatus = 'resolved' | 'missing' | 'broken-ancestor';

export interface ParentStatus {
  status: ParentChainStatus;
  broken_ref?: string;
  broken_pack_name?: string;
}

export type ResolvedArtifactOrigin = 'own' | 'parent' | 'built-in';

/** One artifact in a pack's fully-resolved (own + inherited) artifact set. */
export interface ResolvedArtifact {
  artifact_type: ArtifactType;
  artifact_id: string;
  name: string;
  category?: string;
  origin: ResolvedArtifactOrigin;
  source_pack_id?: string;
  source_pack_name?: string;
  roles?: string[];
  domain_keywords?: string[];
  content: unknown;
}

/** Response of `GET /api/packs/{packId}/resolved`. */
export interface ResolvedPack {
  pack_id: string;
  status: ParentStatus;
  artifacts: ResolvedArtifact[];
}

/** Map of pack id → chain status, as returned by GET /api/packs/parent-status. */
export type ParentStatusMap = Record<string, ParentStatus>;

export interface PackListFilters {
  name?: string;
  origin?: PackOrigin;
  importedAtFrom?: string;
  importedAtTo?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
}

export interface ArtifactListFilters {
  packId: string;
  artifactType: ArtifactType;
  name?: string;
  /** Exact array-element match against profile `roles`. */
  rolesContains?: string;
  /** Exact array-element match against profile `domain_keywords`. */
  domainKeywordsContains?: string;
  /** PocketBase sort expression; profiles default to `name`. */
  sort?: string;
}

export interface PackApiErrorBody {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface PackExportResult {
  blob: Blob;
  filename: string | null;
  validationStatus: ValidationStatus | null;
  validationErrors: unknown | null;
}

/** Agent Profile Detail page — presentation-only view models (data-model.md). */

export interface ModeDefault {
  mode: string;
  description?: string;
  'use-case'?: string;
}

export interface DirectiveReference {
  code: string;
  name?: string;
  rationale?: string;
}

export interface TacticReference {
  id: string;
  rationale?: string;
}

export interface AgentProfileSectionTabDef {
  id: 'capabilities' | 'specialization' | 'collaboration' | 'directives-tactics' | 'raw';
  label: string;
}

/** Pack Artifact Detail pages — presentation-only view models (data-model.md). */

export interface DirectiveContentView {
  intent?: string;
  scope?: string;
  enforcement?: string;
  instructions: string[];
  integrityRules: string[];
}

export interface TacticStepView {
  title: string;
  description?: string;
}

export interface TacticContentView {
  purpose?: string;
  steps: TacticStepView[];
  failureModes: string[];
}

export interface ProcedureStepView {
  title: string;
  actor?: string;
  description?: string;
}

export interface ProcedureAntiPatternView {
  name: string;
  description?: string;
}

export interface ProcedureContentView {
  purpose?: string;
  entryCondition?: string;
  exitCondition?: string;
  steps: ProcedureStepView[];
  antiPatterns: ProcedureAntiPatternView[];
  notes?: string;
}

export interface StyleguidePatternView {
  name: string;
  description?: string;
  goodExample?: string;
  badExample?: string;
}

export interface StyleguideContentView {
  scope?: string;
  principles: string[];
  patterns: StyleguidePatternView[];
  antiPatterns: StyleguidePatternView[];
  qualityTest?: string;
  tooling: Record<string, string>;
}

export interface ToolguideContentView {
  tool?: string;
  guidePath?: string;
  summary?: string;
}

export interface MissionStepContractDelegateCandidateView {
  id: string;
  /** `null` when the candidate could not be resolved to an in-pack Directive/Tactic. */
  link: string[] | null;
}

export interface MissionStepContractInputView {
  flag?: string;
  source?: string;
  optional?: boolean;
}

export interface MissionStepContractStepView {
  id: string;
  description?: string;
  command?: string;
  inputs: MissionStepContractInputView[];
  guidance?: string;
  delegateCandidates: MissionStepContractDelegateCandidateView[];
}

export interface MissionStepContractContentView {
  action?: string;
  mission?: string;
  steps: MissionStepContractStepView[];
}

export interface MarkdownContentView {
  /** `null` when `content.raw` is absent/empty — Details is omitted in that case. */
  sanitizedHtml: string | null;
}
