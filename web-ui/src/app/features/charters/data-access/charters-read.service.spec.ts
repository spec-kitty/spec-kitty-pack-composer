import { TestBed } from '@angular/core/testing';

import { PocketBaseClient } from '../../packs/data-access/pocketbase.client';
import type { Charter } from '../models';
import { ChartersReadService, buildCharterListFilter } from './charters-read.service';

describe('buildCharterListFilter', () => {
  it('returns an empty string when no filters are provided', () => {
    expect(buildCharterListFilter({})).toBe('');
  });

  it('builds a name ~ filter, escaping embedded double quotes', () => {
    expect(buildCharterListFilter({ name: 'my "charter"' })).toBe('name ~ "my \\"charter\\""');
  });

  it('builds an active = filter for true and false', () => {
    expect(buildCharterListFilter({ active: true })).toBe('active = true');
    expect(buildCharterListFilter({ active: false })).toBe('active = false');
  });

  it('joins multiple filters with &&', () => {
    expect(buildCharterListFilter({ name: 'foo', active: true })).toBe('name ~ "foo" && active = true');
  });
});

describe('ChartersReadService.list', () => {
  let getList: ReturnType<typeof vi.fn>;
  let collection: ReturnType<typeof vi.fn>;
  let service: ChartersReadService;

  beforeEach(() => {
    getList = vi.fn().mockResolvedValue({ items: [], page: 1, perPage: 50, totalItems: 0, totalPages: 0 });
    collection = vi.fn(() => ({ getList }));

    TestBed.configureTestingModule({
      providers: [{ provide: PocketBaseClient, useValue: { pb: { collection } } }],
    });

    service = TestBed.inject(ChartersReadService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('reads the "charters" collection with default paging/sort when no options are given', async () => {
    await service.list();

    expect(collection).toHaveBeenCalledWith('charters');
    expect(getList).toHaveBeenCalledWith(1, 50, expect.objectContaining({ sort: '-updated' }));
  });

  it('forwards caller-supplied page/perPage/sort and a built filter', async () => {
    await service.list({ name: 'Foo' }, { page: 2, perPage: 10, sort: 'name' });

    expect(getList).toHaveBeenCalledWith(
      2,
      10,
      expect.objectContaining({ filter: 'name ~ "Foo"', sort: 'name' }),
    );
  });
});

describe('ChartersReadService.get', () => {
  let getOne: ReturnType<typeof vi.fn>;
  let collection: ReturnType<typeof vi.fn>;
  let service: ChartersReadService;

  beforeEach(() => {
    getOne = vi.fn();
    collection = vi.fn(() => ({ getOne }));

    TestBed.configureTestingModule({
      providers: [{ provide: PocketBaseClient, useValue: { pb: { collection } } }],
    });

    service = TestBed.inject(ChartersReadService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('calls pb.collection("charters").getOne(id) with the exact id passed through', async () => {
    const fixture: Charter = {
      id: 'ch1',
      name: 'My Charter',
      active: true,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
    };
    getOne.mockResolvedValue(fixture);

    const result = await service.get('ch1');

    expect(collection).toHaveBeenCalledWith('charters');
    expect(getOne).toHaveBeenCalledWith('ch1');
    expect(result).toBe(fixture);
  });
});
