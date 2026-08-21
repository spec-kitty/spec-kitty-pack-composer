import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { BrnComboboxAnchor, BrnComboboxPopoverTrigger, BrnComboboxTrigger } from '@spartan-ng/brain/combobox';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmComboboxImports } from '@spartan-ng/helm/combobox';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { ChartersApiService } from '../data-access/charters-api.service';
import { ActiveCharterStore } from './active-charter.store';

/**
 * Header-visible switcher for "which charter is active" (FR-006).
 *
 * Renders a Spartan combobox listing every charter by name, reading straight from
 * `ActiveCharterStore` — the single source of truth also used by the Charters
 * overview page — so it never needs its own cached copy of the charters list or any
 * reconciliation logic to stay in sync with charters created/activated elsewhere.
 *
 * The trigger button is composed directly from the Brn combobox directives (rather
 * than `<hlm-combobox-trigger>`) because the packaged Hlm trigger component does not
 * forward a static `aria-label` to its inner button — see the vendored source under
 * `web-ui/libs/ui/combobox/src/lib/hlm-combobox-trigger.ts`.
 */
@Component({
  selector: 'app-active-charter-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmComboboxImports,
    HlmSpinnerImports,
    HlmButton,
    BrnComboboxAnchor,
    BrnComboboxTrigger,
    BrnComboboxPopoverTrigger,
    NgIcon,
    RouterLink,
  ],
  providers: [provideIcons({ lucideChevronDown })],
  host: { class: 'flex items-center gap-2' },
  template: `
    @if (isEmpty()) {
      <a
        routerLink="/charters"
        aria-label="Active charter"
        class="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md border border-dashed px-3 py-1.5 text-sm outline-none focus-visible:ring-2"
      >
        No charters yet — create one
      </a>
    } @else {
      <hlm-combobox
        [value]="activeCharterId()"
        (valueChange)="onValueChange($event)"
        [itemToString]="itemToString"
        [disabled]="isActivating()"
      >
        <button
          brnComboboxTrigger
          brnComboboxAnchor
          brnComboboxPopoverTrigger
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          aria-label="Active charter"
          class="w-48 justify-between gap-2"
        >
          <hlm-combobox-value placeholder="No active charter" class="truncate" />
          @if (isActivating()) {
            <hlm-spinner aria-label="Activating charter" class="shrink-0" />
          } @else {
            <ng-icon name="lucideChevronDown" class="text-muted-foreground shrink-0" />
          }
        </button>

        <hlm-combobox-content *hlmComboboxPortal>
          <hlm-combobox-empty>No charters found.</hlm-combobox-empty>
          <div hlmComboboxList>
            @for (charter of charters(); track charter.id) {
              <hlm-combobox-item [value]="charter.id">{{ charter.name }}</hlm-combobox-item>
            }
          </div>
        </hlm-combobox-content>
      </hlm-combobox>

      @if (errorMessage()) {
        <span role="alert" class="text-destructive text-xs">{{ errorMessage() }}</span>
      }
    }
  `,
})
export class ActiveCharterSwitcher {
  private readonly chartersApi = inject(ChartersApiService);
  private readonly store = inject(ActiveCharterStore);

  protected readonly charters = this.store.charters;
  protected readonly isActivating = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly activeCharterId = this.store.activeCharterId;
  protected readonly isEmpty = computed(() => this.charters().length === 0);

  protected readonly itemToString = (id: string): string =>
    this.charters().find((charter) => charter.id === id)?.name ?? '';

  protected async onValueChange(id: string | null | undefined): Promise<void> {
    if (!id || id === this.activeCharterId()) {
      return;
    }

    this.errorMessage.set(null);
    this.isActivating.set(true);
    try {
      await this.chartersApi.activateCharter(id);
      this.store.setActiveCharterId(id);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to activate charter.',
      );
    } finally {
      this.isActivating.set(false);
    }
  }
}
