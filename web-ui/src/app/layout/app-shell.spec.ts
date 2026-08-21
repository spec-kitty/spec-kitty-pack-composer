import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ChartersApiService, ChartersReadService } from '../features/charters/data-access';
import type { CharterSummary } from '../features/charters/models';
import { ActiveCharterStore } from '../features/charters/shared';
import { AppShell } from './app-shell';
import { ThemeSelector } from './theme-selector';
import { ThemeService } from './theme.service';

class FakeChartersReadService {
  list = vi.fn().mockResolvedValue({ items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 0 });
}

class FakeChartersApiService {
  activateCharter = vi.fn();
}

class FakeActiveCharterStore {
  refreshCalls = 0;
  private readonly _charters = signal<CharterSummary[]>([]);
  charters = this._charters.asReadonly();
  activeCharterId = (): string | null => null;

  refresh(): Promise<void> {
    this.refreshCalls += 1;
    return Promise.resolve();
  }

  setActiveCharterId(): void {
    // no-op
  }
}

function stubMatchMedia(matches = false): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
      }) as MediaQueryList,
  });
}

describe('AppShell', () => {
  let store: FakeActiveCharterStore;

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubMatchMedia();
    store = new FakeActiveCharterStore();

    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        ThemeService,
        { provide: ChartersReadService, useClass: FakeChartersReadService },
        { provide: ChartersApiService, useClass: FakeChartersApiService },
        { provide: ActiveCharterStore, useValue: store },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders a header with the Pack Composer brand (FR-001)', async () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('header')).toBeTruthy();
    expect(el.textContent).toContain('Pack Composer');
    expect(el.querySelector('main')).toBeTruthy();
  });

  it('lists Packs and Charters as primary nav entries, in that order (FR-002)', async () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    await fixture.whenStable();

    const nav = (fixture.nativeElement as HTMLElement).querySelector(
      'nav[aria-label="Primary"]',
    );
    expect(nav).toBeTruthy();

    const links = Array.from(nav!.querySelectorAll('a'));
    expect(links).toHaveLength(2);
    expect(links[0].textContent?.trim()).toBe('Packs');
    expect(links[0].getAttribute('href')).toBe('/packs');
    expect(links[1].textContent?.trim()).toBe('Charters');
    expect(links[1].getAttribute('href')).toBe('/charters');
  });

  it('includes an accessible theme selector control (FR-003)', async () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    await fixture.whenStable();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label="Theme selector"]',
    );
    expect(trigger).toBeTruthy();
  });

  it('renders the global active-charter switcher in the header (FR-006)', async () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-active-charter-switcher')).toBeTruthy();
    expect(el.querySelector('[aria-label="Active charter"]')).toBeTruthy();
  });

  it('refreshes the active-charter store once on app startup, without requiring a /charters visit (FR-006)', async () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.refreshCalls).toBe(1);
  });
});

describe('ThemeSelector', () => {
  beforeEach(async () => {
    localStorage.clear();
    stubMatchMedia();

    await TestBed.configureTestingModule({
      imports: [ThemeSelector],
      providers: [provideSpartanHlm(), ThemeService],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('offers dark, light, and system choices (FR-003)', () => {
    const fixture = TestBed.createComponent(ThemeSelector);
    fixture.detectChanges();

    const modes = fixture.componentInstance['options'].map(
      (option) => option.mode,
    );
    expect(modes).toEqual(['light', 'dark', 'system']);
  });
});
