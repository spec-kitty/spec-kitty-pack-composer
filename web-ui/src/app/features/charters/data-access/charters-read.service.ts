import { Service, inject } from '@angular/core';
import type { ListResult, RecordModel } from 'pocketbase';

import { escapePocketBaseFilterValue, joinFilters } from '../../packs/data-access/pocketbase-filter.util';
import { PocketBaseClient } from '../../packs/data-access/pocketbase.client';
import type { Charter, CharterListFilters } from '../models';

const CHARTERS_COLLECTION = 'charters';

export interface CharterListOptions {
  page?: number;
  perPage?: number;
  sort?: string;
}

/**
 * Direct PocketBase-SDK reads for the `charters` collection (name/active/created/updated only).
 *
 * IMPORTANT: `list()`/`get()` here do NOT include `enabled_item_count`/`has_conflicts` — those
 * require the custom `/api/charters/summaries` route. `ActiveCharterStore` (the single source of
 * truth for both the header switcher and the Charters overview page) calls
 * `ChartersApiService.getSummaries()` instead. This file's `list()`/`get()` exist for lightweight
 * lookups where the summary counts aren't needed — e.g. `charter-detail.page.ts`'s `get(id)`.
 */
@Service()
export class ChartersReadService {
  private readonly pb = inject(PocketBaseClient).pb;

  async list(
    filters: CharterListFilters = {},
    options: CharterListOptions = {},
  ): Promise<ListResult<Charter>> {
    const filter = buildCharterListFilter(filters);
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 50;
    const sort = options.sort ?? '-updated';

    return this.pb.collection(CHARTERS_COLLECTION).getList<Charter & RecordModel>(page, perPage, {
      filter: filter || undefined,
      sort,
    });
  }

  async get(id: string): Promise<Charter> {
    return this.pb.collection(CHARTERS_COLLECTION).getOne<Charter & RecordModel>(id);
  }
}

export function buildCharterListFilter(filters: CharterListFilters): string {
  const name = filters.name?.trim();
  return joinFilters([
    name ? `name ~ "${escapePocketBaseFilterValue(name)}"` : undefined,
    filters.active !== undefined ? `active = ${filters.active ? 'true' : 'false'}` : undefined,
  ]);
}
