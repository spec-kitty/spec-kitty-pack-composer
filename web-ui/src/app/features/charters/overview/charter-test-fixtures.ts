import type { CharterSummary } from '../models';

/** CharterSummary record builder shared by overview specs. Test-only helper. */
export function makeCharterSummary(overrides: Partial<CharterSummary> = {}): CharterSummary {
  return {
    id: 'charter-1',
    name: 'Doctrine Charter',
    active: false,
    enabled_item_count: 0,
    has_conflicts: false,
    created: '2026-01-15T10:00:00.000Z',
    updated: '2026-02-20T10:00:00.000Z',
    ...overrides,
  };
}
