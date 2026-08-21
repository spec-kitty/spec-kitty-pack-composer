import { Service, inject } from '@angular/core';
import type { ListResult, RecordModel } from 'pocketbase';

import type { Pack, PackListFilters, PackVersionHistory } from '../models';
import { escapePocketBaseFilterValue, joinFilters } from './pocketbase-filter.util';
import { PocketBaseClient } from './pocketbase.client';

const PACKS_COLLECTION = 'packs';
const VERSION_HISTORY_COLLECTION = 'pack_version_history';

export interface PackListOptions {
  page?: number;
  perPage?: number;
  sort?: string;
}

@Service()
export class PacksReadService {
  private readonly pb = inject(PocketBaseClient).pb;

  async list(
    filters: PackListFilters = {},
    options: PackListOptions = {},
  ): Promise<ListResult<Pack>> {
    const filter = buildPackListFilter(filters);
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 50;
    const sort = options.sort ?? '-updated_at';

    return this.pb.collection(PACKS_COLLECTION).getList<Pack & RecordModel>(page, perPage, {
      filter: filter || undefined,
      sort,
    });
  }

  async get(id: string): Promise<Pack> {
    return this.pb.collection(PACKS_COLLECTION).getOne<Pack & RecordModel>(id);
  }

  /** Version history for the Versions card — newest first. */
  async listVersionHistory(packId: string): Promise<PackVersionHistory[]> {
    const filter = `pack = "${escapePocketBaseFilterValue(packId)}"`;
    const result = await this.pb
      .collection(VERSION_HISTORY_COLLECTION)
      .getFullList<PackVersionHistory & RecordModel>({
        filter,
        sort: '-observed_at',
      });
    return result;
  }
}

export function buildPackListFilter(filters: PackListFilters): string {
  const name = filters.name?.trim();
  return joinFilters([
    name ? `name ~ "${escapePocketBaseFilterValue(name)}"` : undefined,
    filters.origin ? `origin = "${escapePocketBaseFilterValue(filters.origin)}"` : undefined,
    filters.importedAtFrom
      ? `imported_at >= "${escapePocketBaseFilterValue(filters.importedAtFrom)}"`
      : undefined,
    filters.importedAtTo
      ? `imported_at <= "${escapePocketBaseFilterValue(filters.importedAtTo)}"`
      : undefined,
    filters.updatedAtFrom
      ? `updated_at >= "${escapePocketBaseFilterValue(filters.updatedAtFrom)}"`
      : undefined,
    filters.updatedAtTo
      ? `updated_at <= "${escapePocketBaseFilterValue(filters.updatedAtTo)}"`
      : undefined,
  ]);
}
