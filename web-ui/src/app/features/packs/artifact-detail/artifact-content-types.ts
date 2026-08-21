import type {
  ArtifactType,
  DirectiveContentView,
  ProcedureAntiPatternView,
  ProcedureContentView,
  StyleguideContentView,
  StyleguidePatternView,
  TacticContentView,
  ToolguideContentView,
} from '../models';

/**
 * Defensive, never-throws-on-malformed-input helpers, mirroring
 * `agent-detail/agent-section-types.ts`'s helper set (duplicated here rather
 * than extracted to a shared location, since extraction would create an
 * awkward cross-feature-folder dependency for ~4 tiny pure functions).
 */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    : [];
}

/** Generic content-reading helper; used by WP06's Mission Step Contract accessor. */
export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Extracts the Directive Details view (FR-006). `content.procedures` (an
 * ordered list of free-text instruction steps) maps to `instructions` — not
 * to be confused with the unrelated `procedure` artifact type; the YAML key
 * stays `procedures`, the UI-facing name is "Instructions." Do not "fix"
 * this back to `procedures`.
 */
export function getDirectiveContent(content: unknown): DirectiveContentView {
  const record = asRecord(content);
  return {
    intent: asNonEmptyString(record?.['intent']),
    scope: asNonEmptyString(record?.['scope']),
    enforcement: asNonEmptyString(record?.['enforcement']),
    instructions: asStringArray(record?.['procedures']),
    integrityRules: asStringArray(record?.['integrity_rules']),
  };
}

/** Extracts the Tactic Details view (FR-007). */
export function getTacticContent(content: unknown): TacticContentView {
  const record = asRecord(content);
  return {
    purpose: asNonEmptyString(record?.['purpose']),
    steps: asRecordArray(record?.['steps']).map((entry) => ({
      title: asNonEmptyString(entry['title']) ?? '',
      description: asNonEmptyString(entry['description']),
    })),
    failureModes: asStringArray(record?.['failure_modes']),
  };
}

/**
 * Extracts the Procedure Details view (FR-008). `steps[].actor` real-world
 * values are `agent`/`human`, but the type stays plain `string | undefined`
 * (no union) — an unrecognized value passes through unchanged rather than
 * being dropped or throwing; the renderer decides how to badge it.
 */
export function getProcedureContent(content: unknown): ProcedureContentView {
  const record = asRecord(content);
  const antiPatterns: ProcedureAntiPatternView[] = asRecordArray(record?.['anti_patterns']).map(
    (entry) => ({
      name: asNonEmptyString(entry['name']) ?? '',
      description: asNonEmptyString(entry['description']),
    }),
  );
  return {
    purpose: asNonEmptyString(record?.['purpose']),
    entryCondition: asNonEmptyString(record?.['entry_condition']),
    exitCondition: asNonEmptyString(record?.['exit_condition']),
    steps: asRecordArray(record?.['steps']).map((entry) => ({
      title: asNonEmptyString(entry['title']) ?? '',
      actor: asNonEmptyString(entry['actor']),
      description: asNonEmptyString(entry['description']),
    })),
    antiPatterns,
    notes: asNonEmptyString(record?.['notes']),
  };
}

function toStyleguidePatternView(entry: Record<string, unknown>): StyleguidePatternView {
  return {
    name: asNonEmptyString(entry['name']) ?? '',
    description: asNonEmptyString(entry['description']),
    goodExample: asNonEmptyString(entry['good_example']),
    badExample: asNonEmptyString(entry['bad_example']),
  };
}

/** Keeps only string-valued entries of an open, arbitrary-key string-map. */
function asStringMap(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entryValue] of Object.entries(record)) {
    if (typeof entryValue === 'string' && entryValue.trim()) {
      result[key] = entryValue;
    }
  }
  return result;
}

/**
 * Extracts the Styleguide Details view (FR-009). `tooling` is an open
 * string-map — its key set varies per styleguide in the wild, so it is
 * never treated as a fixed schema.
 */
export function getStyleguideContent(content: unknown): StyleguideContentView {
  const record = asRecord(content);
  return {
    scope: asNonEmptyString(record?.['scope']),
    principles: asStringArray(record?.['principles']),
    patterns: asRecordArray(record?.['patterns']).map(toStyleguidePatternView),
    antiPatterns: asRecordArray(record?.['anti_patterns']).map(toStyleguidePatternView),
    qualityTest: asNonEmptyString(record?.['quality_test']),
    tooling: asStringMap(record?.['tooling']),
  };
}

/** Extracts the Toolguide Details view (FR-010). */
export function getToolguideContent(content: unknown): ToolguideContentView {
  const record = asRecord(content);
  return {
    tool: asNonEmptyString(record?.['tool']),
    guidePath: asNonEmptyString(record?.['guide_path']),
    summary: asNonEmptyString(record?.['summary']),
  };
}

function hasDirectiveContent(content: unknown): boolean {
  const view = getDirectiveContent(content);
  return (
    !!view.intent ||
    !!view.scope ||
    !!view.enforcement ||
    view.instructions.length > 0 ||
    view.integrityRules.length > 0
  );
}

function hasTacticContent(content: unknown): boolean {
  const view = getTacticContent(content);
  return !!view.purpose || view.steps.length > 0 || view.failureModes.length > 0;
}

function hasProcedureContent(content: unknown): boolean {
  const view = getProcedureContent(content);
  return (
    !!view.purpose ||
    !!view.entryCondition ||
    !!view.exitCondition ||
    view.steps.length > 0 ||
    view.antiPatterns.length > 0 ||
    !!view.notes
  );
}

function hasStyleguideContent(content: unknown): boolean {
  const view = getStyleguideContent(content);
  return (
    !!view.scope ||
    view.principles.length > 0 ||
    view.patterns.length > 0 ||
    view.antiPatterns.length > 0 ||
    !!view.qualityTest ||
    Object.keys(view.tooling).length > 0
  );
}

function hasToolguideContent(content: unknown): boolean {
  const view = getToolguideContent(content);
  return !!view.tool || !!view.guidePath || !!view.summary;
}

/** Whether a `template`/`glossary`-shaped `content.raw` has any text to show. */
function hasRawMarkdownContent(content: unknown): boolean {
  return !!asNonEmptyString(asRecord(content)?.['raw']);
}

const TYPE_PRESENCE: Partial<Record<ArtifactType, (content: unknown) => boolean>> = {
  directive: hasDirectiveContent,
  tactic: hasTacticContent,
  procedure: hasProcedureContent,
  styleguide: hasStyleguideContent,
  toolguide: hasToolguideContent,
};

/**
 * FR-005/FR-014 — the single presence check the Details-tab orchestrator
 * (WP08) uses to decide whether the Details tab should render at all for a
 * given artifact, versus falling back to Raw-only. Never throws.
 *
 * Stub behavior for types this WP does not build full accessors for:
 * - `mission_step_contract` always returns `true` (it structurally always
 *   has at least `steps` once parsed) — WP06 owns the full accessor and may
 *   replace this stub if it proves insufficient.
 * - `template`/`glossary` return `true` only when `content.raw` is a
 *   non-empty string — a lightweight "is there text to show" check that
 *   does not require WP07's full markdown-parsing logic. WP07 owns the full
 *   `MarkdownContentView` accessor and may replace this stub.
 * - `profile` is out of scope for this dispatcher (handled by the Agent
 *   Profile Detail page's own `buildAgentSectionTabs`); defaults to `true`.
 */
export function hasAnyDetailsContent(artifactType: ArtifactType, content: unknown): boolean {
  const predicate = TYPE_PRESENCE[artifactType];
  if (predicate) {
    return predicate(content);
  }
  if (artifactType === 'template' || artifactType === 'glossary') {
    return hasRawMarkdownContent(content);
  }
  // mission_step_contract, profile: reasonable stub default.
  return true;
}
