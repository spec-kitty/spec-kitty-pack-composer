import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { getCapabilitiesContent } from './agent-section-types';

/**
 * Capabilities & Context tab body — capabilities + context-sources chips (FR-008).
 */
@Component({
  selector: 'app-agent-capabilities-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      @if (data().capabilities.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Capabilities</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (capability of data().capabilities; track capability) {
              <span hlmBadge variant="outline">{{ capability }}</span>
            }
          </div>
        </section>
      }

      @if (hasContextSources()) {
        <section class="space-y-3">
          <h3 class="text-sm font-medium">Context Sources</h3>

          @if (data().doctrineLayers.length > 0) {
            <div class="space-y-1.5">
              <h4 class="text-muted-foreground text-xs font-medium">Doctrine Layers</h4>
              <div class="flex flex-wrap gap-1.5">
                @for (layer of data().doctrineLayers; track layer) {
                  <span hlmBadge variant="outline">{{ layer }}</span>
                }
              </div>
            </div>
          }

          @if (data().directives.length > 0) {
            <div class="space-y-1.5">
              <h4 class="text-muted-foreground text-xs font-medium">Directives</h4>
              <div class="flex flex-wrap gap-1.5">
                @for (directive of data().directives; track directive) {
                  <span hlmBadge variant="outline">{{ directive }}</span>
                }
              </div>
            </div>
          }

          @if (data().additional.length > 0) {
            <div class="space-y-1.5">
              <h4 class="text-muted-foreground text-xs font-medium">Additional</h4>
              <div class="flex flex-wrap gap-1.5">
                @for (item of data().additional; track item) {
                  <span hlmBadge variant="outline">{{ item }}</span>
                }
              </div>
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class AgentCapabilitiesTab {
  readonly content = input<unknown>(null);

  protected readonly data = computed(() => getCapabilitiesContent(this.content()));

  protected readonly hasContextSources = computed(() => {
    const { doctrineLayers, directives, additional } = this.data();
    return doctrineLayers.length > 0 || directives.length > 0 || additional.length > 0;
  });
}
