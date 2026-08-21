import { TestBed } from '@angular/core/testing';

import { PocketBaseClient } from '../../packs/data-access/pocketbase.client';
import type {
  BulkAddResult,
  CharterGrid,
  CharterItem,
  CharterSummary,
  RelatedItemsResult,
  ToggleResult,
} from '../models';
import { CharterApiError, ChartersApiService } from './charters-api.service';

const BASE_URL = 'http://localhost:8090';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('ChartersApiService (FR-007 / FR-008)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let service: ChartersApiService;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    TestBed.configureTestingModule({
      providers: [{ provide: PocketBaseClient, useValue: { baseUrl: BASE_URL } }],
    });

    service = TestBed.inject(ChartersApiService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  describe('createCharter', () => {
    it('POSTs {apiBase}/ with the name in the JSON body and parses a CharterSummary', async () => {
      const fixture: CharterSummary = {
        id: 'ch1',
        name: 'My Charter',
        active: true,
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-01T00:00:00Z',
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.createCharter('My Charter');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'My Charter' }),
        }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a CharterApiError on a 400 missing-name response', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'name is required', code: 'bad_request' }, 400));

      await expect(service.createCharter('')).rejects.toMatchObject({
        name: 'CharterApiError',
        message: 'name is required',
        status: 400,
        code: 'bad_request',
      });
      await expect(service.createCharter('')).rejects.toBeInstanceOf(CharterApiError);
    });
  });

  describe('activateCharter', () => {
    it('POSTs {apiBase}/{id}/activate with the id URL-encoded', async () => {
      const fixture: CharterSummary = {
        id: 'ch 1',
        name: 'My Charter',
        active: true,
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-01T00:00:00Z',
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.activateCharter('ch 1');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/${encodeURIComponent('ch 1')}/activate`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a CharterApiError on 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Charter not found', code: 'not_found' }, 404));

      await expect(service.activateCharter('missing')).rejects.toMatchObject({
        name: 'CharterApiError',
        status: 404,
      });
    });
  });

  describe('renameCharter', () => {
    it('PATCHes {apiBase}/{id} with the new name', async () => {
      const fixture: CharterSummary = {
        id: 'ch1',
        name: 'Renamed',
        active: false,
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-02T00:00:00Z',
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.renameCharter('ch1', 'Renamed');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Renamed' }),
        }),
      );
      expect(result).toEqual(fixture);
    });
  });

  describe('deleteCharter', () => {
    it('DELETEs {apiBase}/{id} and resolves void on 204', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await expect(service.deleteCharter('ch1')).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('rejects with a CharterApiError on 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Charter not found' }, 404));

      await expect(service.deleteCharter('missing')).rejects.toBeInstanceOf(CharterApiError);
    });
  });

  describe('getSummaries', () => {
    it('GETs {apiBase}/summaries and parses a CharterSummary[]', async () => {
      const fixture: CharterSummary[] = [
        {
          id: 'ch1',
          name: 'A',
          active: true,
          enabled_item_count: 3,
          has_conflicts: false,
          created: '2026-01-01T00:00:00Z',
          updated: '2026-01-01T00:00:00Z',
        },
      ];
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.getSummaries();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/summaries`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(fixture);
    });
  });

  describe('getGrid', () => {
    it('GETs {apiBase}/{id}/grid and parses a CharterGrid', async () => {
      const fixture: CharterGrid = {
        directive: [],
        tactic: [],
        procedure: [],
        styleguide: [],
        toolguide: [],
        profile: [],
        mission_step_contract: [],
        template: [],
        glossary: [],
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.getGrid('ch1');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1/grid`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a CharterApiError on 404', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Charter not found' }, 404));

      await expect(service.getGrid('missing')).rejects.toBeInstanceOf(CharterApiError);
    });
  });

  describe('addItem', () => {
    it('POSTs {apiBase}/{charterId}/items with pack_artifact_id and parses a CharterItem', async () => {
      const fixture: CharterItem = {
        id: 'item1',
        charter: 'ch1',
        pack_artifact: 'pa1',
        pack_name: 'Pack A',
        artifact_type: 'directive',
        artifact_id: 'DIRECTIVE_001',
        artifact_name: 'Some Directive',
        enabled: true,
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.addItem('ch1', 'pa1');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1/items`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ pack_artifact_id: 'pa1' }),
        }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a CharterApiError on 404 (charter or pack artifact not found)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Pack artifact not found' }, 404));

      await expect(service.addItem('ch1', 'missing')).rejects.toBeInstanceOf(CharterApiError);
    });
  });

  describe('getRelatedItems', () => {
    it('GETs {apiBase}/{charterId}/items/related?pack_artifact_id={id} and parses a RelatedItemsResult (FR-026)', async () => {
      const fixture: RelatedItemsResult = {
        target: { pack_artifact_id: 'pa1', artifact_type: 'directive', artifact_id: 'DIRECTIVE_001', name: 'Directive One' },
        related: [
          {
            pack_artifact_id: 'pa2',
            artifact_type: 'tactic',
            artifact_id: 'TACTIC_1',
            name: 'Tactic One',
            pack_name: 'Pack A',
            already_in_charter: false,
          },
        ],
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.getRelatedItems('ch1', 'pa1');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1/items/related?pack_artifact_id=pa1`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a CharterApiError on 404 (charter or pack artifact not found)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Pack artifact not found' }, 404));

      await expect(service.getRelatedItems('ch1', 'missing')).rejects.toBeInstanceOf(CharterApiError);
    });
  });

  describe('addItemsBulk', () => {
    it('POSTs {apiBase}/{charterId}/items/bulk with pack_artifact_ids and parses a BulkAddResult (FR-026)', async () => {
      const fixture: BulkAddResult = {
        items: [
          {
            id: 'item1',
            charter: 'ch1',
            pack_artifact: 'pa1',
            pack_name: 'Pack A',
            artifact_type: 'directive',
            artifact_id: 'DIRECTIVE_001',
            artifact_name: 'Directive One',
            enabled: true,
          },
        ],
        added_count: 1,
        already_present_count: 0,
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.addItemsBulk('ch1', ['pa1', 'pa2']);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1/items/bulk`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ pack_artifact_ids: ['pa1', 'pa2'] }),
        }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a CharterApiError on 400 (empty pack_artifact_ids)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'pack_artifact_ids must contain at least one id' }, 400));

      await expect(service.addItemsBulk('ch1', [])).rejects.toBeInstanceOf(CharterApiError);
    });
  });

  describe('removeItem', () => {
    it('DELETEs {apiBase}/{charterId}/items/{itemId} and resolves void on 204', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await expect(service.removeItem('ch1', 'item1')).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1/items/item1`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('toggleItem', () => {
    it('POSTs {apiBase}/{charterId}/items/{itemId}/toggle with enabled and parses a ToggleResult', async () => {
      const fixture: ToggleResult = {
        item: {
          id: 'item1',
          charter: 'ch1',
          pack_name: 'Pack A',
          artifact_type: 'directive',
          artifact_id: 'DIRECTIVE_001',
          artifact_name: 'Some Directive',
          enabled: true,
        },
        auto_disabled: [],
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));

      const result = await service.toggleItem('ch1', 'item1', true);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1/items/item1/toggle`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ enabled: true }),
        }),
      );
      expect(result).toEqual(fixture);
    });

    it('rejects with a CharterApiError on 400 (missing source cannot be toggled)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Item has a missing source' }, 400));

      await expect(service.toggleItem('ch1', 'item1', true)).rejects.toBeInstanceOf(CharterApiError);
    });
  });

  describe('exportCharter', () => {
    it('POSTs {apiBase}/{id}/export and extracts blob + validation headers', async () => {
      const blob = new Blob(['zip-bytes']);
      const response = new Response(blob, {
        status: 200,
        headers: {
          'X-Charter-Validation-Status': 'valid',
          'Content-Disposition': 'attachment; filename="my-charter-charter-bundle.zip"',
        },
      });
      fetchMock.mockResolvedValue(response);

      const result = await service.exportCharter('ch1');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/charters/ch1/export`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.filename).toBe('my-charter-charter-bundle.zip');
      expect(result.validationStatus).toBe('valid');
      expect(result.validationErrors).toBeNull();
      expect(result.blob).toBeInstanceOf(Blob);
    });

    it('parses X-Charter-Validation-Errors as JSON when status=errors', async () => {
      const errors = [{ path: 'directives[0]', message: 'missing intent' }];
      const response = new Response(new Blob(['zip-bytes']), {
        status: 200,
        headers: {
          'X-Charter-Validation-Status': 'errors',
          'X-Charter-Validation-Errors': JSON.stringify(errors),
        },
      });
      fetchMock.mockResolvedValue(response);

      const result = await service.exportCharter('ch1');

      expect(result.validationStatus).toBe('errors');
      expect(result.validationErrors).toEqual(errors);
    });

    it('rejects with a CharterApiError on 503 (spec-kitty CLI unavailable)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'spec-kitty CLI missing' }, 503));

      await expect(service.exportCharter('ch1')).rejects.toBeInstanceOf(CharterApiError);
    });

    it('rejects with a CharterApiError on 409 (export already in progress)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Export already in progress' }, 409));

      await expect(service.exportCharter('ch1')).rejects.toBeInstanceOf(CharterApiError);
    });
  });

  describe('importCharter', () => {
    it('POSTs {apiBase}/import as multipart FormData with a bundle field, not JSON', async () => {
      const fixture: CharterSummary = {
        id: 'ch2',
        name: 'Imported Charter',
        active: true,
        created: '2026-01-01T00:00:00Z',
        updated: '2026-01-01T00:00:00Z',
      };
      fetchMock.mockResolvedValue(jsonResponse(fixture));
      const file = new File(['bundle-bytes'], 'bundle.zip', { type: 'application/zip' });

      const result = await service.importCharter(file);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/api/charters/import`);
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get('bundle')).toBe(file);
      expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
      expect(result).toEqual(fixture);
    });

    it('rejects with a CharterApiError on 400 (bundle fails structural validation)', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ message: 'Not a valid charter bundle' }, 400));
      const file = new File(['not-a-bundle'], 'bad.zip');

      await expect(service.importCharter(file)).rejects.toBeInstanceOf(CharterApiError);
    });
  });
});
