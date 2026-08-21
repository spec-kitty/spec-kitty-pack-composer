import { Service, computed, inject, signal } from '@angular/core';

import { ChartersApiService } from '../data-access/charters-api.service';
import type { CharterSummary } from '../models';

/**
 * Global signal-based store holding the full charters list and "which charter is
 * currently active" — the single source of truth for every surface that lists
 * charters or needs to know/change the active one.
 *
 * Consumed by the header switcher, the Charters overview page, and every pack-page
 * Add/Remove control, so a change made from any one of them (create, import,
 * activate, rename, delete) is immediately visible everywhere else without a page
 * reload — no surface keeps its own separate copy of the charters list.
 */
@Service()
export class ActiveCharterStore {
  private readonly chartersApi = inject(ChartersApiService);

  private readonly _charters = signal<CharterSummary[]>([]);
  readonly charters = this._charters.asReadonly();

  private readonly _activeCharterId = signal<string | null>(null);
  readonly activeCharterId = this._activeCharterId.asReadonly();
  readonly hasActiveCharter = computed(() => this._activeCharterId() !== null);

  /**
   * Re-fetches the full charters list and re-derives the active charter id from it.
   * Call once at app startup and again after any action that could change the
   * charters list itself or which charter is active (create, activate, rename,
   * delete, import) so every consumer of `charters`/`activeCharterId` stays in sync.
   */
  async refresh(): Promise<void> {
    const summaries = await this.chartersApi.getSummaries();
    this._charters.set(summaries);
    const active = summaries.find((charter) => charter.active);
    this._activeCharterId.set(active?.id ?? null);
  }

  /**
   * Optimistic local update for right after an `activateCharter` call succeeds, so
   * every surface reflects the new active charter immediately without waiting for a
   * full `refresh()` round trip. Only flips the `active` flag on charters already
   * present in the cached list — callers whose mutation could also add/remove rows
   * (create, import, delete) MUST still follow up with `refresh()`.
   */
  setActiveCharterId(id: string | null): void {
    this._activeCharterId.set(id);
    this._charters.update((charters) =>
      charters.map((charter) => (charter.active === (charter.id === id) ? charter : { ...charter, active: charter.id === id })),
    );
  }
}
