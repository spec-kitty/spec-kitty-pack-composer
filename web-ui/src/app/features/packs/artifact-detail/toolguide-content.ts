import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { hlmCode } from '@spartan-ng/helm/typography';

import { getToolguideContent } from './artifact-content-types';

/**
 * Toolguide Details renderer (FR-010) — the simplest content type: tool
 * (badge), guide path (inline code, deliberately never a link — the paired
 * `.md` guide file is not itself imported as pack content, per
 * `research.md` R1), and summary (main body text). Each field is
 * independently `@if`-gated; renders nothing when all three are absent.
 */
@Component({
  selector: 'app-toolguide-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      @if (view().tool; as tool) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Tool</h3>
          <span hlmBadge variant="secondary">{{ tool }}</span>
        </section>
      }

      @if (view().guidePath; as guidePath) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Guide Path</h3>
          <code [class]="hlmCode">{{ guidePath }}</code>
        </section>
      }

      @if (view().summary; as summary) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Summary</h3>
          <p class="text-muted-foreground text-sm whitespace-pre-wrap">{{ summary }}</p>
        </section>
      }
    </div>
  `,
})
export class ToolguideContent {
  readonly content = input<unknown>(null);

  protected readonly view = computed(() => getToolguideContent(this.content()));

  protected readonly hlmCode = hlmCode;
}
