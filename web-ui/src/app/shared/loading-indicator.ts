import { Component, input } from '@angular/core';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

export type LoadingIndicatorMode = 'spinner' | 'skeleton';

/**
 * Presentational loading UI for FR-024 — spinner (default) or skeleton placeholders.
 * Intended for reuse on overview/detail API waits (WP06/WP07).
 */
@Component({
  selector: 'app-loading-indicator',
  imports: [HlmSpinnerImports, HlmSkeletonImports],
  host: {
    class: 'inline-flex',
    role: 'status',
    '[attr.aria-busy]': 'true',
    '[attr.aria-label]': 'label()',
  },
  template: `
    @if (mode() === 'spinner') {
      <span class="inline-flex items-center gap-2 text-muted-foreground">
        <hlm-spinner [attr.aria-label]="label()" />
        @if (showLabel()) {
          <span class="text-sm">{{ label() }}</span>
        }
      </span>
    } @else {
      <span class="flex w-full max-w-md flex-col gap-2" aria-hidden="true">
        @for (row of skeletonRows(); track $index) {
          <hlm-skeleton [class]="rowClass($index)" />
        }
      </span>
      <span class="sr-only">{{ label() }}</span>
    }
  `,
})
export class LoadingIndicator {
  /** Visual mode: animated spinner or pulse skeleton rows. */
  readonly mode = input<LoadingIndicatorMode>('spinner');

  /** Accessible / visible label (spinner mode). */
  readonly label = input('Loading');

  /** When true, show the label text next to the spinner. */
  readonly showLabel = input(true);

  /** Number of skeleton rows when mode is skeleton. */
  readonly skeletonCount = input(3);

  protected skeletonRows(): number[] {
    const count = Math.max(1, this.skeletonCount());
    return Array.from({ length: count }, (_, index) => index);
  }

  protected rowClass(index: number): string {
    // Vary widths slightly so the skeleton reads as content, not a solid block.
    if (index % 3 === 1) {
      return 'h-4 w-5/6';
    }
    if (index % 3 === 2) {
      return 'h-4 w-2/3';
    }
    return 'h-4 w-full';
  }
}
