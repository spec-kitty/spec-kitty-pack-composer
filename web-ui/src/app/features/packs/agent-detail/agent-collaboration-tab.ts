import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { getCollaborationContent } from './agent-section-types';

/**
 * Collaboration tab body — six independently-omitted chip lists (FR-008).
 */
@Component({
  selector: 'app-agent-collaboration-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      @if (data().handoffTo.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Handoff To</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (item of data().handoffTo; track item) {
              <span hlmBadge variant="outline">{{ item }}</span>
            }
          </div>
        </section>
      }

      @if (data().handoffFrom.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Handoff From</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (item of data().handoffFrom; track item) {
              <span hlmBadge variant="outline">{{ item }}</span>
            }
          </div>
        </section>
      }

      @if (data().worksWith.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Works With</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (item of data().worksWith; track item) {
              <span hlmBadge variant="outline">{{ item }}</span>
            }
          </div>
        </section>
      }

      @if (data().outputArtifacts.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Output Artifacts</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (item of data().outputArtifacts; track item) {
              <span hlmBadge variant="outline">{{ item }}</span>
            }
          </div>
        </section>
      }

      @if (data().operatingProcedures.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Operating Procedures</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (item of data().operatingProcedures; track item) {
              <span hlmBadge variant="outline">{{ item }}</span>
            }
          </div>
        </section>
      }

      @if (data().canonicalVerbs.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Canonical Verbs</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (item of data().canonicalVerbs; track item) {
              <span hlmBadge variant="outline">{{ item }}</span>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class AgentCollaborationTab {
  readonly content = input<unknown>(null);

  protected readonly data = computed(() => getCollaborationContent(this.content()));
}
