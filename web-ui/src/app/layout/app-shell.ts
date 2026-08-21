import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ActiveCharterSwitcher, ActiveCharterStore } from '../features/charters/shared';
import { ThemeSelector } from './theme-selector';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ThemeSelector, ActiveCharterSwitcher],
  host: {
    class: 'flex min-h-dvh flex-col bg-background text-foreground',
  },
  template: `
    <header
      class="border-border bg-background sticky top-0 z-40 w-full border-b"
    >
      <div class="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-4">
        <a
          routerLink="/"
          class="text-foreground focus-visible:ring-ring rounded-md text-base font-semibold tracking-tight outline-none focus-visible:ring-2"
        >
          Pack Composer
        </a>

        <nav aria-label="Primary" class="flex flex-1 items-center gap-1">
          <a
            routerLink="/packs"
            routerLinkActive="bg-muted text-foreground"
            [routerLinkActiveOptions]="{ exact: false }"
            class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"
          >
            Packs
          </a>
          <a
            routerLink="/charters"
            routerLinkActive="bg-muted text-foreground"
            [routerLinkActiveOptions]="{ exact: false }"
            class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"
          >
            Charters
          </a>
        </nav>

        <app-active-charter-switcher />
        <app-theme-selector />
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <router-outlet />
    </main>
  `,
})
export class AppShell {
  private readonly activeCharterStore = inject(ActiveCharterStore);

  constructor() {
    // Ensures the header switcher and every pack page's Add/Remove controls have correct
    // active-charter state on first app load, not just after visiting /charters once.
    void this.activeCharterStore.refresh();
  }
}
