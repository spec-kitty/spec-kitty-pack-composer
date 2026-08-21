import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { getDirectivesAndTactics } from './agent-section-types';

/**
 * Directives & Tactics tab body — directive/tactic reference lists (FR-008).
 */
@Component({
  selector: 'app-agent-directives-tactics-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      @if (data().directiveReferences.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Directive References</h3>
          <div class="space-y-2">
            @for (directive of data().directiveReferences; track directive.code) {
              <div class="border-border rounded-md border p-2.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span hlmBadge variant="outline" class="font-mono">{{ directive.code }}</span>
                  @if (directive.name) {
                    <span class="text-sm font-semibold">{{ directive.name }}</span>
                  }
                </div>
                @if (directive.rationale) {
                  <p class="text-muted-foreground mt-1 text-sm">{{ directive.rationale }}</p>
                }
              </div>
            }
          </div>
        </section>
      }

      @if (data().tacticReferences.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Tactic References</h3>
          <div class="space-y-2">
            @for (tactic of data().tacticReferences; track tactic.id) {
              <div class="border-border rounded-md border p-2.5">
                <span hlmBadge variant="outline" class="font-mono">{{ tactic.id }}</span>
                @if (tactic.rationale) {
                  <p class="text-muted-foreground mt-1 text-sm">{{ tactic.rationale }}</p>
                }
              </div>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class AgentDirectivesTacticsTab {
  readonly content = input<unknown>(null);

  protected readonly data = computed(() => getDirectivesAndTactics(this.content()));
}
