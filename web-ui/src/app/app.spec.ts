import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { App } from './app';
import { routes } from './app.routes';
import { ChartersReadService } from './features/charters/data-access';
import type { CharterSummary } from './features/charters/models';
import { ActiveCharterStore } from './features/charters/shared';

class FakeActiveCharterStore {
  private readonly _charters = signal<CharterSummary[]>([]);
  charters = this._charters.asReadonly();
  activeCharterId = (): string | null => null;

  refresh(): Promise<void> {
    return Promise.resolve();
  }

  setActiveCharterId(): void {
    // no-op
  }
}

class FakeChartersReadService {
  list(): Promise<{ items: never[]; page: number; perPage: number; totalItems: number; totalPages: number }> {
    return Promise.resolve({ items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 0 });
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

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubMatchMedia();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideSpartanHlm(),
        { provide: ActiveCharterStore, useClass: FakeActiveCharterStore },
        { provide: ChartersReadService, useClass: FakeChartersReadService },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the project shell chrome', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Pack Composer');
    expect(compiled.querySelector('nav[aria-label="Primary"]')).toBeTruthy();
    expect(
      compiled.querySelector('button[aria-label="Theme selector"]'),
    ).toBeTruthy();
  });
});
