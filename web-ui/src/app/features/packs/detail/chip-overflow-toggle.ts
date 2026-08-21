import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

/**
 * Presentational "+N" / "<" toggle chip used by `ChipOverflowList` to expand/collapse
 * overflowed chips. Extracted so the expand/collapse affordance (labels, ARIA state)
 * has a single, independently testable source of truth.
 */
@Component({
  selector: 'app-chip-overflow-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      hlmBadge
      variant="outline"
      class="cursor-pointer"
      [attr.aria-expanded]="expanded()"
      [attr.aria-label]="label()"
      (click)="toggled.emit()"
    >
      {{ glyph() }}
    </button>
  `,
})
export class ChipOverflowToggle {
  readonly expanded = input.required<boolean>();
  readonly hiddenCount = input.required<number>();

  readonly toggled = output<void>();

  protected readonly glyph = computed(() => (this.expanded() ? '<' : `+${this.hiddenCount()}`));
  protected readonly label = computed(() =>
    this.expanded() ? 'Show fewer' : `${this.hiddenCount()} more`,
  );
}
