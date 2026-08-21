import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';

/** Collapse long descriptions beyond this character threshold (FR-017). */
const COLLAPSE_THRESHOLD = 280;

/**
 * Pack description with expand/collapse when the text is long (FR-017).
 * Read-only — no editors.
 */
@Component({
  selector: 'app-pack-description',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports],
  host: {
    class: 'block',
  },
  template: `
    @if (text(); as description) {
      <section aria-labelledby="pack-description-heading" class="space-y-2">
        <h2 id="pack-description-heading" class="sr-only">Description</h2>
        <p class="text-muted-foreground text-sm whitespace-pre-wrap">
          {{ displayedText() }}
        </p>
        @if (isLong()) {
          <button
            type="button"
            hlmBtn
            variant="link"
            size="sm"
            class="h-auto px-0"
            [attr.aria-expanded]="expanded()"
            (click)="toggle()"
          >
            {{ expanded() ? 'Show less' : 'Show more' }}
          </button>
        }
      </section>
    }
  `,
})
export class PackDescription {
  readonly description = input<string | undefined | null>(undefined);

  protected readonly expanded = signal(false);

  protected readonly text = computed(() => {
    const value = this.description()?.trim();
    return value ? value : null;
  });

  protected readonly isLong = computed(() => {
    const value = this.text();
    return value !== null && value.length > COLLAPSE_THRESHOLD;
  });

  protected readonly displayedText = computed(() => {
    const value = this.text();
    if (!value) {
      return '';
    }
    if (!this.isLong() || this.expanded()) {
      return value;
    }
    return `${value.slice(0, COLLAPSE_THRESHOLD).trimEnd()}…`;
  });

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }
}
