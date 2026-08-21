import { TestBed } from '@angular/core/testing';

import { ChartersApiService } from '../data-access/charters-api.service';
import type { CharterSummary } from '../models';
import { makeCharterSummary } from '../overview/charter-test-fixtures';
import { ActiveCharterStore } from './active-charter.store';

describe('ActiveCharterStore', () => {
  let getSummaries: ReturnType<typeof vi.fn>;
  let store: ActiveCharterStore;

  beforeEach(() => {
    getSummaries = vi.fn();

    TestBed.configureTestingModule({
      providers: [{ provide: ChartersApiService, useValue: { getSummaries } }],
    });

    store = TestBed.inject(ActiveCharterStore);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts with an empty charters list, a null activeCharterId, and hasActiveCharter false', () => {
    expect(store.charters()).toEqual([]);
    expect(store.activeCharterId()).toBeNull();
    expect(store.hasActiveCharter()).toBe(false);
  });

  describe('refresh', () => {
    it('sets charters and activeCharterId from the summaries response', async () => {
      const summaries: CharterSummary[] = [
        makeCharterSummary({ id: 'ch1', active: false }),
        makeCharterSummary({ id: 'ch2', active: true }),
        makeCharterSummary({ id: 'ch3', active: false }),
      ];
      getSummaries.mockResolvedValue(summaries);

      await store.refresh();

      expect(store.charters()).toEqual(summaries);
      expect(store.activeCharterId()).toBe('ch2');
      expect(store.hasActiveCharter()).toBe(true);
    });

    it('sets activeCharterId to null when no item has active: true', async () => {
      getSummaries.mockResolvedValue([
        makeCharterSummary({ id: 'ch1', active: false }),
        makeCharterSummary({ id: 'ch2', active: false }),
      ]);

      await store.refresh();

      expect(store.activeCharterId()).toBeNull();
      expect(store.hasActiveCharter()).toBe(false);
    });

    it('sets an empty charters list and null activeCharterId when the response is empty', async () => {
      getSummaries.mockResolvedValue([]);

      await store.refresh();

      expect(store.charters()).toEqual([]);
      expect(store.activeCharterId()).toBeNull();
    });

    it('re-fetching replaces the previous list wholesale, propagating a newly created charter', async () => {
      getSummaries.mockResolvedValue([makeCharterSummary({ id: 'ch1', active: true })]);
      await store.refresh();

      const withNewCharter = [
        makeCharterSummary({ id: 'ch1', active: false }),
        makeCharterSummary({ id: 'ch2', active: true }),
      ];
      getSummaries.mockResolvedValue(withNewCharter);
      await store.refresh();

      expect(store.charters()).toEqual(withNewCharter);
      expect(store.activeCharterId()).toBe('ch2');
    });
  });

  describe('setActiveCharterId', () => {
    it('immediately updates the readonly signal and a derived computed recomputes synchronously', () => {
      store.setActiveCharterId('ch5');

      expect(store.activeCharterId()).toBe('ch5');
      expect(store.hasActiveCharter()).toBe(true);
    });

    it('accepts null to clear the active charter', () => {
      store.setActiveCharterId('ch5');
      store.setActiveCharterId(null);

      expect(store.activeCharterId()).toBeNull();
      expect(store.hasActiveCharter()).toBe(false);
    });

    it('flips the active flag on cached charters to match the new active id', async () => {
      getSummaries.mockResolvedValue([
        makeCharterSummary({ id: 'ch1', active: true }),
        makeCharterSummary({ id: 'ch2', active: false }),
      ]);
      await store.refresh();

      store.setActiveCharterId('ch2');

      const byId = new Map(store.charters().map((charter) => [charter.id, charter]));
      expect(byId.get('ch1')?.active).toBe(false);
      expect(byId.get('ch2')?.active).toBe(true);
    });
  });
});
