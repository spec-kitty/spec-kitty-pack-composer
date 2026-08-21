import { TestBed } from '@angular/core/testing';

import type { ParentStatusMap, ResolvedPack } from '../models';
import { PacksApiError, PacksApiService } from './packs-api.service';
import { PocketBaseClient } from './pocketbase.client';

const BASE_URL = 'http://localhost:8090';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PacksApiService (FR-011 / FR-013)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let service: PacksApiService;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    TestBed.configureTestingModule({
      providers: [{ provide: PocketBaseClient, useValue: { baseUrl: BASE_URL } }],
    });

    service = TestBed.inject(PacksApiService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  describe('getParentStatus', () => {
    it('GETs {apiBase}/parent-status and parses the response into a ParentStatusMap', async () => {
      const fixture: ParentStatusMap = {
        pk_local_001: { status: 'missing', broken_ref: 'acme-platform-doctrine' },
        pk_local_002: { status: 'resolved' },
        pk_builtin: { status: 'resolved' },
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.getParentStatus();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/packs/parent-status`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a PacksApiError carrying the error body message/code on non-2xx', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ message: 'PocketBase unreachable', code: 'db_unavailable' }, 503),
      );

      await expect(service.getParentStatus()).rejects.toMatchObject({
        name: 'PacksApiError',
        message: 'PocketBase unreachable',
        status: 503,
        code: 'db_unavailable',
      });
      await expect(service.getParentStatus()).rejects.toBeInstanceOf(PacksApiError);
    });
  });

  describe('getResolved', () => {
    it('GETs {apiBase}/{packId}/resolved with the id URL-encoded and parses a ResolvedPack', async () => {
      const fixture: ResolvedPack = {
        pack_id: 'pk_local_001',
        status: { status: 'resolved' },
        artifacts: [
          {
            artifact_type: 'directive',
            artifact_id: 'DIRECTIVE_001',
            name: 'Own directive',
            origin: 'own',
            content: { text: 'do the thing' },
          },
          {
            artifact_type: 'profile',
            artifact_id: 'PROF_A',
            name: 'Inherited profile',
            origin: 'parent',
            source_pack_id: 'pk_local_parent',
            source_pack_name: 'Parent Pack',
            content: { description: 'An implementer profile.' },
          },
        ],
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.getResolved('pk local/001');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/packs/${encodeURIComponent('pk local/001')}/resolved`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a PacksApiError carrying the error body message/code on non-2xx', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Pack not found', code: 'not_found' }, 404));

      await expect(service.getResolved('missing-pack')).rejects.toMatchObject({
        name: 'PacksApiError',
        message: 'Pack not found',
        status: 404,
        code: 'not_found',
      });
      await expect(service.getResolved('missing-pack')).rejects.toBeInstanceOf(PacksApiError);
    });
  });
});
