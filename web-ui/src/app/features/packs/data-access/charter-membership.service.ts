import { Service, inject } from '@angular/core';
import type { RecordModel } from 'pocketbase';

import { ChartersApiService } from '../../charters/data-access/charters-api.service';
import type { ArtifactKind, BulkAddResult, CharterItem, RelatedItemsResult } from '../../charters/models';
import { ActiveCharterStore } from '../../charters/shared/active-charter.store';
import { escapePocketBaseFilterValue, joinFilters } from './pocketbase-filter.util';
import { PocketBaseClient } from './pocketbase.client';

const CHARTER_ITEMS_COLLECTION = 'charter_items';

/** Builds the lookup key used by {@link CharterMembershipService.listMembershipForPack}'s map. */
export function membershipKey(artifactType: ArtifactKind, artifactId: string): string {
  return `${artifactType}\u0000${artifactId}`;
}

/**
 * "Is this artifact currently in the active charter?" — the shared lookup every pack-page
 * Add/Remove control (WP11) queries. Always targets the active charter internally, so
 * calling components never need to know the active charter's id themselves.
 */
@Service()
export class CharterMembershipService {
  private readonly pb = inject(PocketBaseClient).pb;
  private readonly activeCharterStore = inject(ActiveCharterStore);
  private readonly chartersApi = inject(ChartersApiService);

  /** Single-item lookup for one artifact detail page at a time (WP11's detail headers). */
  async isInActiveCharter(artifactType: ArtifactKind, artifactId: string): Promise<CharterItem | null> {
    const charterId = this.activeCharterStore.activeCharterId();
    if (!charterId) {
      return null;
    }

    const filter = joinFilters([
      `charter = "${escapePocketBaseFilterValue(charterId)}"`,
      `artifact_type = "${escapePocketBaseFilterValue(artifactType)}"`,
      `artifact_id = "${escapePocketBaseFilterValue(artifactId)}"`,
    ]);

    const result = await this.pb
      .collection(CHARTER_ITEMS_COLLECTION)
      .getList<CharterItem & RecordModel>(1, 1, { filter });

    return result.items[0] ?? null;
  }

  /**
   * Batched lookup for a pack's overview/typed-tab tables (WP11's `pack-table.ts`/
   * `pack-artifact-table.ts`) — fetches all of the active charter's items in one call,
   * so a table with many rows does one query instead of one-per-row.
   *
   * Note: `packId` is accepted for call-site clarity/future filtering but is unused today —
   * the active charter's item set is small enough (per Technical Context) that filtering by
   * pack client-side, if ever needed, is cheap against this one already-fetched list.
   */
  async listMembershipForPack(packId: string): Promise<Map<string, CharterItem>> {
    void packId;
    const charterId = this.activeCharterStore.activeCharterId();
    if (!charterId) {
      return new Map();
    }

    const items = await this.pb
      .collection(CHARTER_ITEMS_COLLECTION)
      .getFullList<CharterItem & RecordModel>({
        filter: `charter = "${escapePocketBaseFilterValue(charterId)}"`,
      });

    const map = new Map<string, CharterItem>();
    for (const item of items) {
      map.set(membershipKey(item.artifact_type, item.artifact_id), item);
    }
    return map;
  }

  /** Thin pass-through to `ChartersApiService.addItem`, scoped to the active charter. */
  async add(packArtifactId: string): Promise<CharterItem> {
    const charterId = this.activeCharterStore.activeCharterId();
    if (!charterId) {
      throw new Error('Cannot add to charter: no charter is currently active.');
    }
    return this.chartersApi.addItem(charterId, packArtifactId);
  }

  /** Thin pass-through to `ChartersApiService.removeItem`, scoped to the active charter. */
  async remove(charterId: string, itemId: string): Promise<void> {
    await this.chartersApi.removeItem(charterId, itemId);
  }

  /**
   * FR-026, applied to every pack-artifact surface (not just the Charter grid): every artifact
   * whose own `references` field points back at the given directive's pack artifact, scoped to
   * the active charter. Returns `null` when there is no active charter to check against.
   */
  async getRelatedItems(packArtifactId: string): Promise<RelatedItemsResult | null> {
    const charterId = this.activeCharterStore.activeCharterId();
    if (!charterId) {
      return null;
    }
    return this.chartersApi.getRelatedItems(charterId, packArtifactId);
  }

  /** Thin pass-through to `ChartersApiService.addItemsBulk`, scoped to the active charter (FR-026). */
  async addBulk(packArtifactIds: string[]): Promise<BulkAddResult> {
    const charterId = this.activeCharterStore.activeCharterId();
    if (!charterId) {
      throw new Error('Cannot add to charter: no charter is currently active.');
    }
    return this.chartersApi.addItemsBulk(charterId, packArtifactIds);
  }
}
