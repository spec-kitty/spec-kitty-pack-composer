import { TestBed } from '@angular/core/testing';

import type { PackArtifact, ResolvedPack } from '../models';
import { ArtifactsReadService } from './artifacts-read.service';
import { PacksApiService } from './packs-api.service';
import { PocketBaseClient } from './pocketbase.client';

describe('ArtifactsReadService.get (FR-011 / FR-012)', () => {
  let getOne: ReturnType<typeof vi.fn>;
  let collection: ReturnType<typeof vi.fn>;
  let service: ArtifactsReadService;

  beforeEach(() => {
    getOne = vi.fn();
    collection = vi.fn(() => ({ getOne }));

    TestBed.configureTestingModule({
      providers: [{ provide: PocketBaseClient, useValue: { pb: { collection } } }],
    });

    service = TestBed.inject(ArtifactsReadService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('calls pb.collection("pack_artifacts").getOne(id) with the exact id passed through', async () => {
    getOne.mockResolvedValue({} as PackArtifact);

    await service.get('artifact-123');

    expect(collection).toHaveBeenCalledWith('pack_artifacts');
    expect(getOne).toHaveBeenCalledWith('artifact-123');
  });

  it('returns the resolved value unchanged', async () => {
    const fixture: PackArtifact = {
      id: 'artifact-123',
      pack: 'pack-1',
      artifact_type: 'profile',
      artifact_id: 'PROF_A',
      name: 'Alice',
      parse_ok: true,
      content: { description: 'An implementer profile.' },
      source_relative_path: 'profiles/alice.yaml',
    };
    getOne.mockResolvedValue(fixture);

    const result = await service.get('artifact-123');

    expect(result).toBe(fixture);
  });
});

describe('ArtifactsReadService.listByPackAndType (auto-cancellation regression)', () => {
  let getList: ReturnType<typeof vi.fn>;
  let collection: ReturnType<typeof vi.fn>;
  let service: ArtifactsReadService;

  beforeEach(() => {
    getList = vi.fn().mockResolvedValue({ items: [], page: 1, perPage: 500, totalItems: 0, totalPages: 0 });
    collection = vi.fn(() => ({ getList }));

    TestBed.configureTestingModule({
      providers: [{ provide: PocketBaseClient, useValue: { pb: { collection } } }],
    });

    service = TestBed.inject(ArtifactsReadService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('forwards a caller-supplied requestKey so concurrent calls to different packs do not auto-cancel each other', async () => {
    await service.listByPackAndType(
      'pack-base',
      'profile',
      {},
      { perPage: 500, requestKey: 'profiles-own-ids:pack-base' },
    );

    expect(getList).toHaveBeenCalledWith(
      1,
      500,
      expect.objectContaining({ requestKey: 'profiles-own-ids:pack-base' }),
    );
  });

  it('leaves requestKey undefined (PocketBase default auto-cancellation) when the caller does not specify one', async () => {
    await service.listByPackAndType('pack-1', 'profile');

    expect(getList).toHaveBeenCalledWith(1, 200, expect.objectContaining({ requestKey: undefined }));
  });
});

describe('ArtifactsReadService.listResolved (FR-011 / FR-013)', () => {
  let getResolved: ReturnType<typeof vi.fn>;
  let service: ArtifactsReadService;

  beforeEach(() => {
    getResolved = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: PocketBaseClient, useValue: { pb: { collection: vi.fn() } } },
        { provide: PacksApiService, useValue: { getResolved } },
      ],
    });

    service = TestBed.inject(ArtifactsReadService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('delegates to PacksApiService.getResolved(packId) and returns exactly its artifacts array', async () => {
    const fixture: ResolvedPack = {
      pack_id: 'pack-1',
      status: { status: 'resolved' },
      artifacts: [
        {
          artifact_type: 'profile',
          artifact_id: 'PROF_A',
          name: 'Alice',
          origin: 'own',
          content: { description: 'An implementer profile.' },
        },
      ],
    };
    getResolved.mockResolvedValue(fixture);

    const result = await service.listResolved('pack-1');

    expect(getResolved).toHaveBeenCalledWith('pack-1');
    expect(result).toBe(fixture.artifacts);
  });
});
