import type { Pack } from '../models';

/** Pack record builder shared by overview specs. Test-only helper. */
export function makePack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: 'pack-1',
    name: 'Doctrine Core',
    source_path: '/var/packs/doctrine-core',
    origin: 'local',
    version: '1.2.3',
    validation_status: 'valid',
    imported_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-02-20T10:00:00.000Z',
    links: [],
    stats: { total: 0, by_type: {} },
    raw_snapshot: null,
    ...overrides,
  };
}
