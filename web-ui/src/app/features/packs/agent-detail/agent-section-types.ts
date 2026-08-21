import type {
  AgentProfileSectionTabDef,
  DirectiveReference,
  ModeDefault,
  TacticReference,
} from '../models';

/** Display order for typed tabs; Raw is appended separately. */
export const AGENT_SECTION_TAB_ORDER = [
  'capabilities',
  'specialization',
  'collaboration',
  'directives-tactics',
] as const;

export const AGENT_SECTION_TAB_LABELS: Record<(typeof AGENT_SECTION_TAB_ORDER)[number], string> = {
  capabilities: 'Capabilities & Context',
  specialization: 'Specialization',
  collaboration: 'Collaboration',
  'directives-tactics': 'Directives & Tactics',
};

export const AGENT_RAW_TAB_ID = 'raw';

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

/** Extracts `content.description` (FR-007). */
export function getProfileDescription(content: unknown): string | undefined {
  return asNonEmptyString(asRecord(content)?.['description']);
}

/** Extracts `content.purpose` (FR-007). */
export function getProfilePurpose(content: unknown): string | undefined {
  return asNonEmptyString(asRecord(content)?.['purpose']);
}

export interface CapabilitiesContent {
  capabilities: string[];
  doctrineLayers: string[];
  directives: string[];
  additional: string[];
}

/** Typed accessor for the Capabilities & Context tab's fields. */
export function getCapabilitiesContent(content: unknown): CapabilitiesContent {
  const record = asRecord(content);
  const contextSources = asRecord(record?.['context-sources']);
  return {
    capabilities: asStringArray(record?.['capabilities']),
    doctrineLayers: asStringArray(contextSources?.['doctrine-layers']),
    directives: asStringArray(contextSources?.['directives']),
    additional: asStringArray(contextSources?.['additional']),
  };
}

export interface SpecializationContent {
  primaryFocus?: string;
  secondaryAwareness?: string;
  avoidanceBoundary?: string;
  successDefinition?: string;
  languages: string[];
  frameworks: string[];
  filePatterns: string[];
  writingStyle: string[];
  complexityPreference: string[];
  modeDefaults: ModeDefault[];
  initializationDeclaration?: string;
}

/**
 * Typed accessor for the Specialization tab's fields. `languages` merges
 * `specialization-context.languages` with top-level `applies_to_languages`,
 * de-duplicated with first-seen order preserved (data-model.md).
 */
export function getSpecializationContent(content: unknown): SpecializationContent {
  const record = asRecord(content);
  const specialization = asRecord(record?.['specialization']);
  const specializationContext = asRecord(record?.['specialization-context']);

  const mergedLanguages = new Set<string>();
  for (const lang of asStringArray(specializationContext?.['languages'])) {
    mergedLanguages.add(lang);
  }
  for (const lang of asStringArray(record?.['applies_to_languages'])) {
    mergedLanguages.add(lang);
  }

  return {
    primaryFocus: asNonEmptyString(specialization?.['primary-focus']),
    secondaryAwareness: asNonEmptyString(specialization?.['secondary-awareness']),
    avoidanceBoundary: asNonEmptyString(specialization?.['avoidance-boundary']),
    successDefinition: asNonEmptyString(specialization?.['success-definition']),
    languages: [...mergedLanguages],
    frameworks: asStringArray(specializationContext?.['frameworks']),
    filePatterns: asStringArray(specializationContext?.['file-patterns']),
    writingStyle: asStringArray(specializationContext?.['writing-style']),
    complexityPreference: asStringArray(specializationContext?.['complexity-preference']),
    modeDefaults: asRecordArray(record?.['mode-defaults']).map((entry) => ({
      mode: asNonEmptyString(entry['mode']) ?? '',
      description: asNonEmptyString(entry['description']),
      'use-case': asNonEmptyString(entry['use-case']),
    })),
    initializationDeclaration: asNonEmptyString(record?.['initialization-declaration']),
  };
}

export interface CollaborationContent {
  handoffTo: string[];
  handoffFrom: string[];
  worksWith: string[];
  outputArtifacts: string[];
  operatingProcedures: string[];
  canonicalVerbs: string[];
}

/** Typed accessor for the Collaboration tab's fields. */
export function getCollaborationContent(content: unknown): CollaborationContent {
  const collaboration = asRecord(asRecord(content)?.['collaboration']);
  return {
    handoffTo: asStringArray(collaboration?.['handoff-to']),
    handoffFrom: asStringArray(collaboration?.['handoff-from']),
    worksWith: asStringArray(collaboration?.['works-with']),
    outputArtifacts: asStringArray(collaboration?.['output-artifacts']),
    operatingProcedures: asStringArray(collaboration?.['operating-procedures']),
    canonicalVerbs: asStringArray(collaboration?.['canonical-verbs']),
  };
}

export interface DirectivesAndTactics {
  directiveReferences: DirectiveReference[];
  tacticReferences: TacticReference[];
}

/** Typed accessor for the Directives & Tactics tab's fields. */
export function getDirectivesAndTactics(content: unknown): DirectivesAndTactics {
  const record = asRecord(content);
  return {
    directiveReferences: asRecordArray(record?.['directive-references']).map((entry) => ({
      code: asNonEmptyString(entry['code']) ?? '',
      name: asNonEmptyString(entry['name']),
      rationale: asNonEmptyString(entry['rationale']),
    })),
    tacticReferences: asRecordArray(record?.['tactic-references']).map((entry) => ({
      id: asNonEmptyString(entry['id']) ?? '',
      rationale: asNonEmptyString(entry['rationale']),
    })),
  };
}

function hasCapabilities(content: unknown): boolean {
  const { capabilities, doctrineLayers, directives, additional } = getCapabilitiesContent(content);
  return (
    capabilities.length > 0 ||
    doctrineLayers.length > 0 ||
    directives.length > 0 ||
    additional.length > 0
  );
}

function hasSpecialization(content: unknown): boolean {
  const spec = getSpecializationContent(content);
  return (
    !!spec.primaryFocus ||
    !!spec.secondaryAwareness ||
    !!spec.avoidanceBoundary ||
    !!spec.successDefinition ||
    spec.languages.length > 0 ||
    spec.frameworks.length > 0 ||
    spec.filePatterns.length > 0 ||
    spec.writingStyle.length > 0 ||
    spec.complexityPreference.length > 0 ||
    spec.modeDefaults.length > 0 ||
    !!spec.initializationDeclaration
  );
}

function hasCollaboration(content: unknown): boolean {
  const collab = getCollaborationContent(content);
  return (
    collab.handoffTo.length > 0 ||
    collab.handoffFrom.length > 0 ||
    collab.worksWith.length > 0 ||
    collab.outputArtifacts.length > 0 ||
    collab.operatingProcedures.length > 0 ||
    collab.canonicalVerbs.length > 0
  );
}

function hasDirectivesAndTactics(content: unknown): boolean {
  const { directiveReferences, tacticReferences } = getDirectivesAndTactics(content);
  return directiveReferences.length > 0 || tacticReferences.length > 0;
}

const TAB_PRESENCE: Record<
  (typeof AGENT_SECTION_TAB_ORDER)[number],
  (content: unknown) => boolean
> = {
  capabilities: hasCapabilities,
  specialization: hasSpecialization,
  collaboration: hasCollaboration,
  'directives-tactics': hasDirectivesAndTactics,
};

/**
 * Build the ordered list of typed section tabs present in a profile's
 * `content`, always appending Raw last (FR-013). Never throws on
 * unexpected/malformed shapes.
 */
export function buildAgentSectionTabs(content: unknown): AgentProfileSectionTabDef[] {
  const tabs: AgentProfileSectionTabDef[] = [];

  for (const id of AGENT_SECTION_TAB_ORDER) {
    if (TAB_PRESENCE[id](content)) {
      tabs.push({ id, label: AGENT_SECTION_TAB_LABELS[id] });
    }
  }

  tabs.push({ id: AGENT_RAW_TAB_ID, label: 'Raw' });
  return tabs;
}
