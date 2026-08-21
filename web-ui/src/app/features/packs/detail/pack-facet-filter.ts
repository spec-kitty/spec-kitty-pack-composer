import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCirclePlus } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmCommandImports } from '@spartan-ng/helm/command';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';

/**
 * Collapsible multi-select filter (button + popover + searchable checkbox list),
 * modeled after the spartan.ng "tasks" example faceted filter.
 */
@Component({
  selector: 'app-pack-facet-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmCheckboxImports, HlmCommandImports, HlmPopoverImports],
  providers: [provideIcons({ lucideCirclePlus })],
  host: { class: 'inline-block' },
  template: `
    <hlm-popover [state]="state()" (stateChanged)="state.set($event)" sideOffset="5" align="start">
      <button
        type="button"
        hlmBtn
        hlmPopoverTrigger
        variant="outline"
        size="sm"
        class="border-dashed"
        [attr.aria-label]="title() + ' filter'"
        [attr.aria-expanded]="state() === 'open'"
      >
        <ng-icon name="lucideCirclePlus" class="mr-2" />
        {{ title() }}
        @if (selectedList().length > 0) {
          <span class="bg-border mx-2 h-4 w-px shrink-0" aria-hidden="true"></span>
          <div class="flex gap-1">
            @for (value of selectedList(); track value) {
              <span class="bg-secondary text-secondary-foreground rounded px-1 py-0.5 text-xs">
                {{ value }}
              </span>
            }
          </div>
        }
      </button>
      <hlm-command *hlmPopoverPortal="let ctx" hlmPopoverContent class="w-[220px] p-0">
        <hlm-command-input [placeholder]="'Search ' + title()" />
        <hlm-command-list>
          <div *hlmCommandEmptyState hlmCommandEmpty>No results found.</div>
          <hlm-command-group>
            @for (option of options(); track option) {
              <button
                hlm-command-item
                [value]="option"
                [attr.aria-pressed]="isSelected(option)"
                (selected)="toggle(option)"
              >
                <hlm-checkbox class="mr-2" [checked]="isSelected(option)" />
                {{ option }}
              </button>
            }
          </hlm-command-group>
        </hlm-command-list>
      </hlm-command>
    </hlm-popover>
  `,
})
export class PackFacetFilter {
  readonly title = input.required<string>();
  readonly options = input<readonly string[]>([]);
  readonly selected = input<ReadonlySet<string>>(new Set<string>());
  readonly selectedChange = output<Set<string>>();

  protected readonly state = signal<'open' | 'closed'>('closed');
  protected readonly selectedList = computed(() => [...this.selected()]);

  protected isSelected(option: string): boolean {
    return this.selected().has(option);
  }

  protected toggle(option: string): void {
    const next = new Set(this.selected());
    if (next.has(option)) {
      next.delete(option);
    } else {
      next.add(option);
    }
    this.selectedChange.emit(next);
  }
}
