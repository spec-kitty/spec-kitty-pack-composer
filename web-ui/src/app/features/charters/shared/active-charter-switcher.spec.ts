import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ChartersApiService } from '../data-access/charters-api.service';
import type { CharterSummary } from '../models';
import { makeCharterSummary } from '../overview/charter-test-fixtures';
import { ActiveCharterSwitcher } from './active-charter-switcher';
import { ActiveCharterStore } from './active-charter.store';

class Deferred<T> {
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;
  readonly promise: Promise<T>;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

function charter(id: string, name: string, active = false): CharterSummary {
  return makeCharterSummary({ id, name, active });
}

class FakeChartersApiService {
  readonly activateCalls: string[] = [];
  activatePending: Deferred<unknown> | null = null;

  activateCharter(id: string): Promise<unknown> {
    this.activateCalls.push(id);
    this.activatePending = new Deferred<unknown>();
    return this.activatePending.promise;
  }
}

/**
 * Backed by real Angular signals (not plain functions) so the component under
 * test observes updates the same way it would from the real store.
 */
class FakeActiveCharterStore {
  readonly setCalls: Array<string | null> = [];
  private readonly _charters = signal<CharterSummary[]>([]);
  readonly charters = this._charters.asReadonly();
  readonly activeCharterId = computed(() => this._charters().find((c) => c.active)?.id ?? null);

  setCharters(charters: CharterSummary[]): void {
    this._charters.set(charters);
  }

  setActiveCharterId(id: string | null): void {
    this.setCalls.push(id);
    this._charters.update((charters) => charters.map((c) => ({ ...c, active: c.id === id })));
  }
}

describe('ActiveCharterSwitcher', () => {
  let api: FakeChartersApiService;
  let store: FakeActiveCharterStore;

  beforeAll(() => {
    // jsdom doesn't implement scrollIntoView/ResizeObserver; the combobox uses both to keep
    // the active item in view and size the popover (mirrors pack-facet-filter.spec.ts's stub).
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    if (typeof ResizeObserver === 'undefined') {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      };
    }
  });

  beforeEach(async () => {
    api = new FakeChartersApiService();
    store = new FakeActiveCharterStore();

    await TestBed.configureTestingModule({
      imports: [ActiveCharterSwitcher],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: ChartersApiService, useValue: api },
        { provide: ActiveCharterStore, useValue: store },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  async function render(charters: CharterSummary[] = []): Promise<ComponentFixture<ActiveCharterSwitcher>> {
    store.setCharters(charters);
    const fixture = TestBed.createComponent(ActiveCharterSwitcher);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  async function settle(fixture: ComponentFixture<ActiveCharterSwitcher>): Promise<void> {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function html(fixture: ComponentFixture<ActiveCharterSwitcher>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function trigger(fixture: ComponentFixture<ActiveCharterSwitcher>): HTMLButtonElement {
    const button = html(fixture).querySelector<HTMLButtonElement>('button[aria-label="Active charter"]');
    expect(button, 'no combobox trigger rendered').toBeTruthy();
    return button!;
  }

  async function openCombobox(fixture: ComponentFixture<ActiveCharterSwitcher>): Promise<void> {
    trigger(fixture).click();
    await settle(fixture);
  }

  function comboboxItems(): HTMLElement[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]'));
  }

  async function selectCharterByName(
    fixture: ComponentFixture<ActiveCharterSwitcher>,
    name: string,
  ): Promise<void> {
    await openCombobox(fixture);
    const item = comboboxItems().find((candidate) => candidate.textContent?.trim() === name);
    expect(item, `no combobox item labelled "${name}"`).toBeTruthy();
    item!.click();
    await settle(fixture);
  }

  it('lists every charter by name from the store (FR-006)', async () => {
    const fixture = await render([charter('ch1', 'Doctrine Charter'), charter('ch2', 'Sample Charter')]);
    await openCombobox(fixture);

    const labels = comboboxItems().map((item) => item.textContent?.trim());
    expect(labels).toEqual(['Doctrine Charter', 'Sample Charter']);
  });

  it('has an accessible name and is keyboard-operable (NFR-003)', async () => {
    const fixture = await render([charter('ch1', 'Doctrine Charter')]);

    const button = trigger(fixture);
    expect(button.getAttribute('aria-label')).toBe('Active charter');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.tagName).toBe('BUTTON');
  });

  it('shows a clear "no charters yet" state when the list is empty, not an empty dropdown (FR-008)', async () => {
    const fixture = await render([]);

    const el = html(fixture);
    expect(el.textContent).toContain('No charters yet');
    expect(el.querySelector('button[aria-label="Active charter"]')).toBeNull();
    const createLink = el.querySelector<HTMLAnchorElement>('a[aria-label="Active charter"]');
    expect(createLink).toBeTruthy();
    expect(createLink!.getAttribute('href')).toBe('/charters');
  });

  it('shows "no active charter" rather than defaulting to the first item when none is active (FR-008)', async () => {
    const fixture = await render([charter('ch1', 'Doctrine Charter'), charter('ch2', 'Sample Charter')]);

    expect(html(fixture).textContent).toContain('No active charter');
    expect(html(fixture).textContent).not.toContain('Doctrine Charter');
  });

  it('reflects the currently-active charter from the store', async () => {
    const fixture = await render([charter('ch1', 'Doctrine Charter'), charter('ch2', 'Sample Charter', true)]);

    expect(html(fixture).textContent).toContain('Sample Charter');
  });

  it('reflects a newly created charter that becomes active elsewhere, since it reads the shared store directly (FR-006 regression)', async () => {
    const fixture = await render([charter('ch1', 'Doctrine Charter')]);

    // Simulate charter-overview.page.ts creating a new charter and refreshing the shared store.
    store.setCharters([charter('ch1', 'Doctrine Charter'), charter('ch3', 'Brand New Charter', true)]);
    await settle(fixture);

    expect(html(fixture).textContent).toContain('Brand New Charter');
    expect(html(fixture).textContent).not.toContain('No active charter');
  });

  it('selecting a charter calls activateCharter and updates the store only once it resolves (FR-006/FR-024)', async () => {
    const fixture = await render([charter('ch1', 'Doctrine Charter'), charter('ch2', 'Sample Charter')]);

    await selectCharterByName(fixture, 'Sample Charter');

    expect(api.activateCalls).toEqual(['ch2']);
    expect(store.setCalls).toEqual([]);

    api.activatePending!.resolve({ id: 'ch2', name: 'Sample Charter', active: true });
    await settle(fixture);

    expect(store.setCalls).toEqual(['ch2']);
  });

  it('shows an inline loading affordance while activation is in flight (FR-024)', async () => {
    const fixture = await render([charter('ch1', 'Doctrine Charter'), charter('ch2', 'Sample Charter')]);

    await openCombobox(fixture);
    const item = comboboxItems().find((candidate) => candidate.textContent?.trim() === 'Sample Charter');
    item!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(html(fixture).querySelector('hlm-spinner')).toBeTruthy();

    api.activatePending!.resolve({ id: 'ch2', name: 'Sample Charter', active: true });
    await settle(fixture);

    expect(html(fixture).querySelector('hlm-spinner')).toBeNull();
  });

  it('does not update the store and surfaces visible feedback when activation fails', async () => {
    const fixture = await render([charter('ch1', 'Doctrine Charter'), charter('ch2', 'Sample Charter')]);

    await selectCharterByName(fixture, 'Sample Charter');
    api.activatePending!.reject(new Error('PocketBase unreachable'));
    await settle(fixture);

    expect(store.setCalls).toEqual([]);
    const alert = html(fixture).querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert!.textContent).toContain('PocketBase unreachable');
  });
});
