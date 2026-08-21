import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Always-on Raw tab — read-only JSON of the pack's assembled snapshot (FR-019, FR-025).
 */
@Component({
  selector: 'app-pack-raw-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  host: {
    class: 'block',
  },
  template: `
    <div class="space-y-2">
      <p class="text-muted-foreground text-sm">Assembled pack JSON (read-only).</p>
      <pre
        class="border-border bg-muted/40 max-h-[min(70vh,40rem)] overflow-auto rounded-lg border p-3 text-xs leading-relaxed"
        tabindex="0"
        role="region"
        aria-label="Raw pack JSON"
        >{{ snapshotJson() | json }}</pre
      >
    </div>
  `,
})
export class PackRawTab {
  readonly snapshot = input<unknown>(null);

  protected readonly snapshotJson = computed(() => this.snapshot() ?? {});
}
