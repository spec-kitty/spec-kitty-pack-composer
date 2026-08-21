import type { Pack, PackArtifact, PackVersionHistory, ResolvedArtifact } from '../models';

export function makePack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: 'pack-1',
    name: 'Acme Pack',
    description: 'A short description',
    project_key: 'acme-pack',
    source_path: '/packs/acme',
    origin: 'local',
    version: '1.2.3',
    validation_status: 'valid',
    imported_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T12:00:00.000Z',
    links: [{ label: 'Docs', url: 'https://example.com/docs' }],
    stats: {
      total: 3,
      by_type: { directive: 2, profile: 1 },
    },
    raw_snapshot: { name: 'Acme Pack', version: '1.2.3' },
    ...overrides,
  };
}

export function makeArtifact(overrides: Partial<PackArtifact> = {}): PackArtifact {
  return {
    id: 'art-1',
    pack: 'pack-1',
    artifact_type: 'directive',
    artifact_id: 'DIR_001',
    name: 'Alpha Directive',
    category: 'governance',
    parse_ok: true,
    content: {},
    source_relative_path: 'directives/alpha.md',
    ...overrides,
  };
}

export function makeResolvedArtifact(overrides: Partial<ResolvedArtifact> = {}): ResolvedArtifact {
  return {
    artifact_type: 'directive',
    artifact_id: 'DIR_001',
    name: 'Alpha Directive',
    category: 'governance',
    origin: 'own',
    content: {},
    ...overrides,
  };
}

export function makeVersion(
  overrides: Partial<PackVersionHistory> = {},
): PackVersionHistory {
  return {
    id: 'vh-1',
    pack: 'pack-1',
    version: '1.2.3',
    observed_at: '2026-02-01T12:00:00.000Z',
    source: 'import',
    ...overrides,
  };
}

export function longDescription(length = 320): string {
  return 'x'.repeat(length);
}
