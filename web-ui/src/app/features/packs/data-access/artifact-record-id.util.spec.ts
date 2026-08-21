import type { PackArtifact, ResolvedArtifact } from '../models';
import type { ArtifactsReadService } from './artifacts-read.service';
import { buildResolvedRecordIdIndex } from './artifact-record-id.util';

function makeArtifact(overrides: Partial<PackArtifact> = {}): PackArtifact {
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

function makeResolvedArtifact(overrides: Partial<ResolvedArtifact> = {}): ResolvedArtifact {
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

describe('buildResolvedRecordIdIndex (FR-002 / research.md R4)', () => {
  let listByPackAndType: ReturnType<typeof vi.fn>;
  let artifactsRead: ArtifactsReadService;

  beforeEach(() => {
    listByPackAndType = vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      perPage: 500,
      totalItems: 0,
      totalPages: 0,
    });
    artifactsRead = { listByPackAndType } as unknown as ArtifactsReadService;
  });

  it('resolves an "own"-origin artifact to its record id from the own pack', async () => {
    listByPackAndType.mockResolvedValue({
      items: [makeArtifact({ id: 'rec-1', artifact_id: 'DIR_001' })],
      page: 1,
      perPage: 500,
      totalItems: 1,
      totalPages: 1,
    });
    const artifact = makeResolvedArtifact({ artifact_id: 'DIR_001', origin: 'own' });

    const index = await buildResolvedRecordIdIndex(
      artifactsRead,
      'pack-1',
      'directive',
      [artifact],
      'test-prefix',
    );

    expect(index.recordIdFor(artifact)).toBe('rec-1');
    expect(listByPackAndType).toHaveBeenCalledTimes(1);
    expect(listByPackAndType).toHaveBeenCalledWith(
      'pack-1',
      'directive',
      {},
      { perPage: 500, requestKey: 'test-prefix:pack-1' },
    );
  });

  it('resolves a "parent"/"built-in"-origin artifact to its record id from its source pack', async () => {
    listByPackAndType.mockImplementation((sourcePackId: string) =>
      Promise.resolve({
        items:
          sourcePackId === 'pack-base'
            ? [makeArtifact({ id: 'rec-base-1', artifact_id: 'DIR_PARENT' })]
            : [],
        page: 1,
        perPage: 500,
        totalItems: sourcePackId === 'pack-base' ? 1 : 0,
        totalPages: 1,
      }),
    );
    const artifact = makeResolvedArtifact({
      artifact_id: 'DIR_PARENT',
      origin: 'parent',
      source_pack_id: 'pack-base',
    });

    const index = await buildResolvedRecordIdIndex(
      artifactsRead,
      'pack-1',
      'directive',
      [artifact],
      'test-prefix',
    );

    expect(index.recordIdFor(artifact)).toBe('rec-base-1');
  });

  it('fetches one distinct requestKey per distinct source pack, in parallel, deduplicating repeats', async () => {
    const artifacts = [
      makeResolvedArtifact({ artifact_id: 'A', origin: 'own' }),
      makeResolvedArtifact({ artifact_id: 'B', origin: 'parent', source_pack_id: 'pack-base' }),
      makeResolvedArtifact({ artifact_id: 'C', origin: 'built-in', source_pack_id: 'pack-base' }),
      makeResolvedArtifact({ artifact_id: 'D', origin: 'built-in', source_pack_id: 'pack-other' }),
    ];

    await buildResolvedRecordIdIndex(artifactsRead, 'pack-1', 'directive', artifacts, 'prefix');

    expect(listByPackAndType).toHaveBeenCalledTimes(3);
    expect(listByPackAndType).toHaveBeenCalledWith(
      'pack-1',
      'directive',
      {},
      {
        perPage: 500,
        requestKey: 'prefix:pack-1',
      },
    );
    expect(listByPackAndType).toHaveBeenCalledWith(
      'pack-base',
      'directive',
      {},
      {
        perPage: 500,
        requestKey: 'prefix:pack-base',
      },
    );
    expect(listByPackAndType).toHaveBeenCalledWith(
      'pack-other',
      'directive',
      {},
      {
        perPage: 500,
        requestKey: 'prefix:pack-other',
      },
    );
  });

  it('returns null (never throws) when the source pack id is unknown', async () => {
    const artifact = makeResolvedArtifact({
      artifact_id: 'DIR_PARENT',
      origin: 'parent',
      source_pack_id: undefined,
    });

    const index = await buildResolvedRecordIdIndex(
      artifactsRead,
      'pack-1',
      'directive',
      [artifact],
      'prefix',
    );

    expect(index.recordIdFor(artifact)).toBeNull();
  });

  it('returns null (never throws) when the source pack has no matching record (e.g. built-in with no per-pack record)', async () => {
    listByPackAndType.mockResolvedValue({
      items: [],
      page: 1,
      perPage: 500,
      totalItems: 0,
      totalPages: 0,
    });
    const artifact = makeResolvedArtifact({
      artifact_id: 'DIR_MISSING',
      origin: 'built-in',
      source_pack_id: 'pack-base',
    });

    const index = await buildResolvedRecordIdIndex(
      artifactsRead,
      'pack-1',
      'directive',
      [artifact],
      'prefix',
    );

    expect(index.recordIdFor(artifact)).toBeNull();
  });

  it('isolates a single source pack fetch failure: other source packs still resolve and the index does not throw', async () => {
    listByPackAndType.mockImplementation((sourcePackId: string) => {
      if (sourcePackId === 'pack-fails') {
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve({
        items:
          sourcePackId === 'pack-base'
            ? [makeArtifact({ id: 'rec-base-1', artifact_id: 'DIR_PARENT' })]
            : [],
        page: 1,
        perPage: 500,
        totalItems: sourcePackId === 'pack-base' ? 1 : 0,
        totalPages: 1,
      });
    });
    const failedArtifact = makeResolvedArtifact({
      artifact_id: 'DIR_FAILED',
      origin: 'built-in',
      source_pack_id: 'pack-fails',
    });
    const okArtifact = makeResolvedArtifact({
      artifact_id: 'DIR_PARENT',
      origin: 'parent',
      source_pack_id: 'pack-base',
    });

    const index = await buildResolvedRecordIdIndex(
      artifactsRead,
      'pack-1',
      'directive',
      [failedArtifact, okArtifact],
      'prefix',
    );

    expect(index.recordIdFor(failedArtifact)).toBeNull();
    expect(index.recordIdFor(okArtifact)).toBe('rec-base-1');
  });

  it('always includes the own pack id in the fetch set, even with zero resolved artifacts', async () => {
    await buildResolvedRecordIdIndex(artifactsRead, 'pack-1', 'directive', [], 'prefix');

    expect(listByPackAndType).toHaveBeenCalledTimes(1);
    expect(listByPackAndType).toHaveBeenCalledWith(
      'pack-1',
      'directive',
      {},
      {
        perPage: 500,
        requestKey: 'prefix:pack-1',
      },
    );
  });
});
