import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';

/** Collapse long text beyond this character threshold (mirrors FR-017's PackDescription threshold). */
const COLLAPSE_THRESHOLD = 280;

/**
 * Parameterized collapsible text section for the Agent Profile Detail page —
 * used for both Description and Purpose (FR-007), each with its own heading.
 * Read-only — no editors. Mirrors `PackDescription`'s collapse/expand behavior.
 */
@Component({
  selector: 'app-agent-detail-text-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports],
  host: {
    class: 'block',
  },
  template: `
    @if (text(); as description) {
      <section [attr.aria-labelledby]="headingId()" class="space-y-2">
        <h2 [id]="headingId()" class="sr-only">{{ heading() }}</h2>
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
export class AgentDetailTextSection {
  readonly heading = input.required<string>();
  readonly description = input<string | undefined | null>(undefined);

  protected readonly expanded = signal(false);

  protected readonly headingId = computed(
    () => `agent-detail-${this.heading().toLowerCase()}-heading`,
  );

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
