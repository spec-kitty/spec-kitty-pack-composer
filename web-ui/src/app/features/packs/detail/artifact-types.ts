import type { ArtifactType, PackStats } from '../models';

/** Display order for typed tabs (FR-018); Raw is appended separately. */
export const ARTIFACT_TYPE_ORDER: readonly ArtifactType[] = [
  'profile',
  'directive',
  'tactic',
  'procedure',
  'styleguide',
  'toolguide',
  'mission_step_contract',
  'template',
  'glossary',
] as const;

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  directive: 'Directives',
  tactic: 'Tactics',
  procedure: 'Procedures',
  styleguide: 'Styleguides',
  toolguide: 'Toolguides',
  profile: 'Profiles',
  mission_step_contract: 'Mission Step Contracts',
  template: 'Templates',
  glossary: 'Glossary',
};

/**
 * Route segment used to build each artifact's detail-page URL
 * (`/packs/:packId/<segment>/:artifactId`), keyed by `artifact_type`.
 * Values must match `data-model.md`'s "Shared route-segment mapping" table exactly.
 */
export const ARTIFACT_TYPE_ROUTE_SEGMENT: Record<ArtifactType, string> = {
  profile: 'agents',
  directive: 'directives',
  tactic: 'tactics',
  procedure: 'procedures',
  styleguide: 'styleguides',
  toolguide: 'toolguides',
  mission_step_contract: 'mission-step-contracts',
  template: 'templates',
  glossary: 'glossary',
};

export interface ArtifactFilterGroup {
  id: string;
  label: string;
  types: readonly ArtifactType[];
}

/**
 * Ordered top-level grouping for the Pack Detail tab strip and the Charter
 * grid's filter chips (FR-001, FR-008). Every raw ArtifactType belongs to
 * exactly one group; `behavioural` is the only group spanning more than one
 * raw type. Order matches ARTIFACT_TYPE_ORDER's existing positions (the
 * `behavioural` group sits where `directive` sits today, since `directive`
 * is first among its four member types).
 */
export const ARTIFACT_FILTER_GROUPS: readonly ArtifactFilterGroup[] = [
  { id: 'profile', label: ARTIFACT_TYPE_LABELS.profile, types: ['profile'] },
  {
    id: 'behavioural',
    label: 'Behavioural',
    types: ['directive', 'tactic', 'procedure', 'styleguide'],
  },
  { id: 'toolguide', label: ARTIFACT_TYPE_LABELS.toolguide, types: ['toolguide'] },
  {
    id: 'mission_step_contract',
    label: ARTIFACT_TYPE_LABELS.mission_step_contract,
    types: ['mission_step_contract'],
  },
  { id: 'template', label: ARTIFACT_TYPE_LABELS.template, types: ['template'] },
  { id: 'glossary', label: ARTIFACT_TYPE_LABELS.glossary, types: ['glossary'] },
] as const;

export const RAW_TAB_ID = 'raw';

export interface PackTabDef {
  id: string;
  label: string;
  artifactTypes?: readonly ArtifactType[];
}

/** Build grouped tabs from non-zero `stats.by_type` counts; always append Raw. */
export function buildPackTabs(stats: PackStats | undefined | null): PackTabDef[] {
  const byType = stats?.by_type ?? {};
  const tabs: PackTabDef[] = [];

  for (const group of ARTIFACT_FILTER_GROUPS) {
    const count = group.types.reduce((sum, type) => sum + (byType[type] ?? 0), 0);
    if (count > 0) {
      tabs.push({ id: group.id, label: group.label, artifactTypes: group.types });
    }
  }

  tabs.push({ id: RAW_TAB_ID, label: 'Raw' });
  return tabs;
}

export function formatValidationStatus(status: string): string {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'errors':
      return 'Errors';
    case 'unknown':
      return 'Unknown';
    default:
      return status;
  }
}

export function formatOrigin(origin: string): string {
  switch (origin) {
    case 'local':
      return 'Local';
    case 'remote':
      return 'Remote';
    default:
      return origin;
  }
}
