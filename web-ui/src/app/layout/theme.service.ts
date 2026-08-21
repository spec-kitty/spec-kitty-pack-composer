import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  PLATFORM_ID,
  Service,
  computed,
  inject,
  signal,
} from '@angular/core';

export type ThemeMode = 'dark' | 'light' | 'system';

export const THEME_STORAGE_KEY = 'pack-composer.theme';

const THEME_MODES: readonly ThemeMode[] = ['dark', 'light', 'system'];

function isThemeMode(value: string | null): value is ThemeMode {
  return value !== null && (THEME_MODES as readonly string[]).includes(value);
}

@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mediaQuery = this.createMediaQuery();
  private readonly systemPrefersDark = signal(this.mediaQuery?.matches ?? false);

  /** User preference: dark | light | system. Defaults to system when unset. */
  readonly mode = signal<ThemeMode>(this.readStoredMode());

  /** Resolved appearance after applying system preference when mode is system. */
  readonly resolved = computed<'dark' | 'light'>(() => {
    const mode = this.mode();
    if (mode === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  });

  constructor() {
    this.applyResolved(this.resolved());

    if (this.mediaQuery) {
      const onChange = (event: MediaQueryListEvent) => {
        this.systemPrefersDark.set(event.matches);
        if (this.mode() === 'system') {
          this.applyResolved(this.resolved());
        }
      };
      this.mediaQuery.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => {
        this.mediaQuery?.removeEventListener('change', onChange);
      });
    }
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    this.persist(mode);
    this.applyResolved(this.resolved());
  }

  private readStoredMode(): ThemeMode {
    if (!isPlatformBrowser(this.platformId)) {
      return 'system';
    }
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : 'system';
  }

  private persist(mode: ThemeMode): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }

  private applyResolved(resolved: 'dark' | 'light'): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.document.documentElement.classList.toggle('dark', resolved === 'dark');
  }

  private createMediaQuery(): MediaQueryList | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    return window.matchMedia('(prefers-color-scheme: dark)');
  }
}
