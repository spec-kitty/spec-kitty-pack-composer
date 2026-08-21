import { TestBed } from '@angular/core/testing';

import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  let mediaMatches = false;
  const changeListeners: Array<(event: MediaQueryListEvent) => void> = [];

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    mediaMatches = false;
    changeListeners.length = 0;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: mediaMatches,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: (
            _type: string,
            listener: (event: MediaQueryListEvent) => void,
          ) => {
            changeListeners.push(listener);
          },
          removeEventListener: (
            _type: string,
            listener: (event: MediaQueryListEvent) => void,
          ) => {
            const index = changeListeners.indexOf(listener);
            if (index >= 0) {
              changeListeners.splice(index, 1);
            }
          },
          dispatchEvent: () => true,
        }) as MediaQueryList,
    });

    TestBed.configureTestingModule({
      providers: [ThemeService],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to system when localStorage is unset (FR-003)', () => {
    const theme = TestBed.inject(ThemeService);

    expect(theme.mode()).toBe('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('restores a stored preference from localStorage (FR-004)', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    const theme = TestBed.inject(ThemeService);

    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists dark mode and applies the dark class (FR-004)', () => {
    const theme = TestBed.inject(ThemeService);

    theme.setMode('dark');

    expect(theme.mode()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists light mode and clears the dark class (FR-004)', () => {
    document.documentElement.classList.add('dark');
    const theme = TestBed.inject(ThemeService);

    theme.setMode('light');

    expect(theme.mode()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists system mode and follows prefers-color-scheme (FR-004)', () => {
    mediaMatches = true;
    const theme = TestBed.inject(ThemeService);

    theme.setMode('system');

    expect(theme.mode()).toBe('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(theme.resolved()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('updates the resolved theme when OS preference changes under system mode (FR-004)', () => {
    mediaMatches = false;
    const theme = TestBed.inject(ThemeService);
    theme.setMode('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    mediaMatches = true;
    for (const listener of changeListeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    expect(theme.resolved()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
