import { JsonPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

/**
 * Always-on Raw tab shared by all 8 new artifact detail pages — read-only
 * JSON of one artifact's assembled content (FR-014, FR-020).
 */
@Component({
  selector: 'app-artifact-raw-tab',
  imports: [JsonPipe],
  host: { class: 'block' },
  template: `
    <div class="space-y-2">
      <p class="text-muted-foreground text-sm">Assembled artifact JSON (read-only).</p>
      <pre
        class="border-border bg-muted/40 max-h-[min(70vh,40rem)] overflow-auto rounded-lg border p-3 text-xs leading-relaxed"
        tabindex="0"
        role="region"
        aria-label="Raw artifact JSON"
        >{{ contentJson() | json }}</pre>
    </div>
  `,
})
export class ArtifactRawTab {
  readonly content = input<unknown>(null);
  protected readonly contentJson = computed(() => this.content() ?? {});
}
