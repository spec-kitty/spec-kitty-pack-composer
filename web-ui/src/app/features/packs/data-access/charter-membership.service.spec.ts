import { TestBed } from '@angular/core/testing';

import { ChartersApiService } from '../../charters/data-access/charters-api.service';
import type { CharterItem } from '../../charters/models';
import { ActiveCharterStore } from '../../charters/shared/active-charter.store';
import { CharterMembershipService, membershipKey } from './charter-membership.service';
import { PocketBaseClient } from './pocketbase.client';

function item(overrides: Partial<CharterItem> = {}): CharterItem {
  return {
    id: 'item1',
    charter: 'ch1',
    pack_artifact: 'pa1',
    pack_name: 'Pack A',
    artifact_type: 'directive',
    artifact_id: 'DIRECTIVE_001',
    artifact_name: 'Some Directive',
    enabled: true,
    ...overrides,
  };
}

describe('CharterMembershipService.isInActiveCharter', () => {
  let getList: ReturnType<typeof vi.fn>;
  let collection: ReturnType<typeof vi.fn>;
  let activeCharterId: ReturnType<typeof vi.fn>;
  let service: CharterMembershipService;

  beforeEach(() => {
    getList = vi.fn();
    collection = vi.fn(() => ({ getList }));
    activeCharterId = vi.fn().mockReturnValue('ch1');

    TestBed.configureTestingModule({
      providers: [
        { provide: PocketBaseClient, useValue: { pb: { collection } } },
        { provide: ActiveCharterStore, useValue: { activeCharterId } },
        { provide: ChartersApiService, useValue: {} },
      ],
    });

    service = TestBed.inject(CharterMembershipService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('returns null immediately (no network call) when there is no active charter', async () => {
    activeCharterId.mockReturnValue(null);

    const result = await service.isInActiveCharter('directive', 'DIRECTIVE_001');

    expect(result).toBeNull();
    expect(collection).not.toHaveBeenCalled();
  });

  it('filters charter_items by charter/artifact_type/artifact_id and returns the match', async () => {
    const fixture = item();
    getList.mockResolvedValue({ items: [fixture], page: 1, perPage: 1, totalItems: 1, totalPages: 1 });

    const result = await service.isInActiveCharter('directive', 'DIRECTIVE_001');

    expect(collection).toHaveBeenCalledWith('charter_items');
    expect(getList).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({
        filter: 'charter = "ch1" && artifact_type = "directive" && artifact_id = "DIRECTIVE_001"',
      }),
    );
    expect(result).toEqual(fixture);
  });

  it('returns null when no matching item is found', async () => {
    getList.mockResolvedValue({ items: [], page: 1, perPage: 1, totalItems: 0, totalPages: 0 });

    const result = await service.isInActiveCharter('directive', 'DIRECTIVE_999');

    expect(result).toBeNull();
  });
});

describe('CharterMembershipService.listMembershipForPack', () => {
  let getFullList: ReturnType<typeof vi.fn>;
  let collection: ReturnType<typeof vi.fn>;
  let activeCharterId: ReturnType<typeof vi.fn>;
  let service: CharterMembershipService;

  beforeEach(() => {
    getFullList = vi.fn();
    collection = vi.fn(() => ({ getFullList }));
    activeCharterId = vi.fn().mockReturnValue('ch1');

    TestBed.configureTestingModule({
      providers: [
        { provide: PocketBaseClient, useValue: { pb: { collection } } },
        { provide: ActiveCharterStore, useValue: { activeCharterId } },
        { provide: ChartersApiService, useValue: {} },
      ],
    });

    service = TestBed.inject(CharterMembershipService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('returns an empty map immediately (no query) when there is no active charter', async () => {
    activeCharterId.mockReturnValue(null);

    const result = await service.listMembershipForPack('pack1');

    expect(result.size).toBe(0);
    expect(collection).not.toHaveBeenCalled();
  });

  it('issues exactly one query and builds a map keyed by artifact_type + artifact_id', async () => {
    const itemA = item({ id: 'a', artifact_type: 'directive', artifact_id: 'D1' });
    const itemB = item({ id: 'b', artifact_type: 'tactic', artifact_id: 'T1' });
    getFullList.mockResolvedValue([itemA, itemB]);

    const result = await service.listMembershipForPack('pack1');

    expect(getFullList).toHaveBeenCalledTimes(1);
    expect(collection).toHaveBeenCalledWith('charter_items');
    expect(result.get(membershipKey('directive', 'D1'))).toEqual(itemA);
    expect(result.get(membershipKey('tactic', 'T1'))).toEqual(itemB);
    expect(result.size).toBe(2);
  });
});

describe('CharterMembershipService.add / remove', () => {
  let addItem: ReturnType<typeof vi.fn>;
  let removeItem: ReturnType<typeof vi.fn>;
  let activeCharterId: ReturnType<typeof vi.fn>;
  let service: CharterMembershipService;

  beforeEach(() => {
    addItem = vi.fn();
    removeItem = vi.fn();
    activeCharterId = vi.fn().mockReturnValue('ch1');

    TestBed.configureTestingModule({
      providers: [
        { provide: PocketBaseClient, useValue: { pb: { collection: vi.fn() } } },
        { provide: ActiveCharterStore, useValue: { activeCharterId } },
        { provide: ChartersApiService, useValue: { addItem, removeItem } },
      ],
    });

    service = TestBed.inject(CharterMembershipService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('add() resolves the active charter id from the store and delegates to ChartersApiService.addItem', async () => {
    const fixture = item();
    addItem.mockResolvedValue(fixture);

    const result = await service.add('pa1');

    expect(addItem).toHaveBeenCalledWith('ch1', 'pa1');
    expect(result).toEqual(fixture);
  });

  it('add() rejects when there is no active charter, without calling the API', async () => {
    activeCharterId.mockReturnValue(null);

    await expect(service.add('pa1')).rejects.toThrow();
    expect(addItem).not.toHaveBeenCalled();
  });

  it('remove() delegates to ChartersApiService.removeItem with the given charter/item ids', async () => {
    removeItem.mockResolvedValue(undefined);

    await service.remove('ch1', 'item1');

    expect(removeItem).toHaveBeenCalledWith('ch1', 'item1');
  });
});

describe('CharterMembershipService.getRelatedItems / addBulk (FR-026)', () => {
  let getRelatedItems: ReturnType<typeof vi.fn>;
  let addItemsBulk: ReturnType<typeof vi.fn>;
  let activeCharterId: ReturnType<typeof vi.fn>;
  let service: CharterMembershipService;

  beforeEach(() => {
    getRelatedItems = vi.fn();
    addItemsBulk = vi.fn();
    activeCharterId = vi.fn().mockReturnValue('ch1');

    TestBed.configureTestingModule({
      providers: [
        { provide: PocketBaseClient, useValue: { pb: { collection: vi.fn() } } },
        { provide: ActiveCharterStore, useValue: { activeCharterId } },
        { provide: ChartersApiService, useValue: { getRelatedItems, addItemsBulk } },
      ],
    });

    service = TestBed.inject(CharterMembershipService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('getRelatedItems() resolves the active charter id and delegates to ChartersApiService.getRelatedItems', async () => {
    const result = {
      target: { pack_artifact_id: 'pa1', artifact_type: 'directive' as const, artifact_id: 'D1', name: 'D' },
      related: [],
    };
    getRelatedItems.mockResolvedValue(result);

    const outcome = await service.getRelatedItems('pa1');

    expect(getRelatedItems).toHaveBeenCalledWith('ch1', 'pa1');
    expect(outcome).toEqual(result);
  });

  it('getRelatedItems() returns null immediately (no API call) when there is no active charter', async () => {
    activeCharterId.mockReturnValue(null);

    const outcome = await service.getRelatedItems('pa1');

    expect(outcome).toBeNull();
    expect(getRelatedItems).not.toHaveBeenCalled();
  });

  it('addBulk() resolves the active charter id and delegates to ChartersApiService.addItemsBulk', async () => {
    const result = { items: [item()], added_count: 1, already_present_count: 0 };
    addItemsBulk.mockResolvedValue(result);

    const outcome = await service.addBulk(['pa1', 'pa2']);

    expect(addItemsBulk).toHaveBeenCalledWith('ch1', ['pa1', 'pa2']);
    expect(outcome).toEqual(result);
  });

  it('addBulk() rejects when there is no active charter, without calling the API', async () => {
    activeCharterId.mockReturnValue(null);

    await expect(service.addBulk(['pa1'])).rejects.toThrow();
    expect(addItemsBulk).not.toHaveBeenCalled();
  });
});
