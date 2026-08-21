import {
  ARTIFACT_FILTER_GROUPS,
  ARTIFACT_TYPE_ORDER,
  buildPackTabs,
  RAW_TAB_ID,
} from './artifact-types';

describe('buildPackTabs (FR-018 / FR-019)', () => {
  it('includes typed tabs for non-zero stats.by_type counts', () => {
    const tabs = buildPackTabs({
      total: 5,
      by_type: { directive: 2, profile: 3, tactic: 0 },
    });

    expect(tabs.map((tab) => tab.id)).toEqual(['profile', 'behavioural', RAW_TAB_ID]);
    expect(tabs.find((tab) => tab.id === 'behavioural')?.label).toBe('Behavioural');
    expect(tabs.find((tab) => tab.id === 'profile')?.label).toBe('Profiles');
  });

  it('omits artifact types with zero or missing counts', () => {
    const tabs = buildPackTabs({
      total: 1,
      by_type: { glossary: 1 },
    });

    expect(tabs.map((tab) => tab.id)).toEqual(['glossary', RAW_TAB_ID]);
    expect(tabs.some((tab) => tab.id === 'behavioural')).toBe(false);
  });

  it('always appends Raw as the last tab', () => {
    expect(buildPackTabs(undefined).map((tab) => tab.id)).toEqual([RAW_TAB_ID]);
    expect(buildPackTabs(null).at(-1)?.id).toBe(RAW_TAB_ID);
    expect(buildPackTabs({ total: 2, by_type: { styleguide: 1, toolguide: 1 } }).at(-1)?.id).toBe(
      RAW_TAB_ID,
    );
    expect(
      buildPackTabs({ total: 2, by_type: { styleguide: 1, toolguide: 1 } }).map((tab) => tab.id),
    ).toEqual(['behavioural', 'toolguide', RAW_TAB_ID]);
  });

  it('collapses a single present grouped type into one behavioural tab spanning the full group', () => {
    const tabs = buildPackTabs({
      total: 3,
      by_type: { styleguide: 3 },
    });

    expect(tabs.map((tab) => tab.id)).toEqual(['behavioural', RAW_TAB_ID]);
    expect(tabs.find((tab) => tab.id === 'behavioural')?.artifactTypes).toEqual([
      'directive',
      'tactic',
      'procedure',
      'styleguide',
    ]);
  });

  it('omits the behavioural tab entirely when none of its member types are present', () => {
    const tabs = buildPackTabs({
      total: 1,
      by_type: { profile: 1 },
    });

    expect(tabs.map((tab) => tab.id)).toEqual(['profile', RAW_TAB_ID]);
  });

  it('ARTIFACT_FILTER_GROUPS is exhaustive: every ArtifactType belongs to exactly one group', () => {
    for (const type of ARTIFACT_TYPE_ORDER) {
      const matchingGroups = ARTIFACT_FILTER_GROUPS.filter((group) => group.types.includes(type));
      expect(matchingGroups).toHaveLength(1);
    }
  });
});
