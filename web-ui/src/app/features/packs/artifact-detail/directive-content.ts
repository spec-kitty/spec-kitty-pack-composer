import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { AgentDetailTextSection } from '../agent-detail/agent-detail-text-section';
import { getDirectiveContent } from './artifact-content-types';

/**
 * Directive Details renderer (FR-006) — Intent, Scope, Enforcement (badge),
 * Instructions (ordered list — UI label for `content.procedures`; see
 * `artifact-content-types.ts`'s naming note), Integrity Rules (unordered
 * list of full-sentence rules, not chips). Absent fields render nothing.
 */
@Component({
  selector: 'app-directive-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports, AgentDetailTextSection],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      <app-agent-detail-text-section heading="Intent" [description]="view().intent" />
      <app-agent-detail-text-section heading="Scope" [description]="view().scope" />

      @if (view().enforcement; as enforcement) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Enforcement</h3>
          <span hlmBadge variant="outline">{{ enforcement }}</span>
        </section>
      }

      @if (view().instructions.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Instructions</h3>
          <ol class="list-decimal space-y-1.5 pl-5 text-sm">
            @for (instruction of view().instructions; track instruction) {
              <li>{{ instruction }}</li>
            }
          </ol>
        </section>
      }

      @if (view().integrityRules.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Integrity Rules</h3>
          <ul class="list-disc space-y-1.5 pl-5 text-sm">
            @for (rule of view().integrityRules; track rule) {
              <li>{{ rule }}</li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class DirectiveContent {
  readonly content = input<unknown>(null);

  protected readonly view = computed(() => getDirectiveContent(this.content()));
}
