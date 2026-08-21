import { Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMonitor, lucideMoon, lucideSun, lucideSunMoon } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';

import { ThemeMode, ThemeService } from './theme.service';

@Component({
  selector: 'app-theme-selector',
  imports: [HlmButtonImports, HlmDropdownMenuImports, NgIcon],
  providers: [provideIcons({ lucideSun, lucideMoon, lucideMonitor, lucideSunMoon })],
  template: `
    <button
      hlmBtn
      variant="outline"
      size="icon"
      type="button"
      align="end"
      aria-label="Theme selector"
      [hlmDropdownMenuTrigger]="themeMenu"
    >
      <ng-icon name="lucideSunMoon" />
    </button>

    <ng-template #themeMenu>
      <hlm-dropdown-menu class="w-40">
        <hlm-dropdown-menu-group>
          <hlm-dropdown-menu-label>Theme</hlm-dropdown-menu-label>
          @let current = theme.mode();
          @for (option of options; track option.mode) {
            <button
              type="button"
              hlmDropdownMenuRadio
              [checked]="current === option.mode"
              (triggered)="theme.setMode(option.mode)"
            >
              <ng-icon [name]="option.icon" />
              {{ option.label }}
              <hlm-dropdown-menu-radio-indicator />
            </button>
          }
        </hlm-dropdown-menu-group>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class ThemeSelector {
  protected readonly theme = inject(ThemeService);

  protected readonly options: ReadonlyArray<{
    mode: ThemeMode;
    label: string;
    icon: string;
  }> = [
    { mode: 'light', label: 'Light', icon: 'lucideSun' },
    { mode: 'dark', label: 'Dark', icon: 'lucideMoon' },
    { mode: 'system', label: 'System', icon: 'lucideMonitor' },
  ];
}
