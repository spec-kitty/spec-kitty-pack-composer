import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Always-on Raw tab — read-only JSON of one profile artifact's content (FR-009, FR-013).
 */
@Component({
  selector: 'app-agent-raw-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  host: { class: 'block' },
  template: `
    <div class="space-y-2">
      <p class="text-muted-foreground text-sm">Assembled profile JSON (read-only).</p>
      <pre
        class="border-border bg-muted/40 max-h-[min(70vh,40rem)] overflow-auto rounded-lg border p-3 text-xs leading-relaxed"
        tabindex="0"
        role="region"
        aria-label="Raw profile JSON"
        >{{ contentJson() | json }}</pre>
    </div>
  `,
})
export class AgentRawTab {
  readonly content = input<unknown>(null);
  protected readonly contentJson = computed(() => this.content() ?? {});
}
