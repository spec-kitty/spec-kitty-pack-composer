import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { getSpecializationContent } from './agent-section-types';

/**
 * Specialization tab body — focus prose, languages/frameworks/patterns chips,
 * mode defaults, and initialization declaration (FR-008).
 */
@Component({
  selector: 'app-agent-specialization-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      @if (hasFocus()) {
        <section class="space-y-2">
          <h3 class="text-sm font-medium">Focus</h3>
          <dl class="space-y-2">
            @if (data().primaryFocus; as value) {
              <div>
                <dt class="text-muted-foreground text-xs font-medium">Primary Focus</dt>
                <dd class="text-sm">{{ value }}</dd>
              </div>
            }
            @if (data().secondaryAwareness; as value) {
              <div>
                <dt class="text-muted-foreground text-xs font-medium">Secondary Awareness</dt>
                <dd class="text-sm">{{ value }}</dd>
              </div>
            }
            @if (data().avoidanceBoundary; as value) {
              <div>
                <dt class="text-muted-foreground text-xs font-medium">Avoidance Boundary</dt>
                <dd class="text-sm">{{ value }}</dd>
              </div>
            }
            @if (data().successDefinition; as value) {
              <div>
                <dt class="text-muted-foreground text-xs font-medium">Success Definition</dt>
                <dd class="text-sm">{{ value }}</dd>
              </div>
            }
          </dl>
        </section>
      }

      @if (data().languages.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Languages</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (language of data().languages; track language) {
              <span hlmBadge variant="outline">{{ language }}</span>
            }
          </div>
        </section>
      }

      @if (data().frameworks.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Frameworks</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (framework of data().frameworks; track framework) {
              <span hlmBadge variant="outline">{{ framework }}</span>
            }
          </div>
        </section>
      }

      @if (data().filePatterns.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">File Patterns</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (pattern of data().filePatterns; track pattern) {
              <span hlmBadge variant="outline">{{ pattern }}</span>
            }
          </div>
        </section>
      }

      @if (data().writingStyle.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Writing Style</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (style of data().writingStyle; track style) {
              <span hlmBadge variant="outline">{{ style }}</span>
            }
          </div>
        </section>
      }

      @if (data().complexityPreference.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Complexity Preference</h3>
          <div class="flex flex-wrap gap-1.5">
            @for (pref of data().complexityPreference; track pref) {
              <span hlmBadge variant="outline">{{ pref }}</span>
            }
          </div>
        </section>
      }

      @if (data().modeDefaults.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Modes</h3>
          <div class="space-y-2">
            @for (mode of data().modeDefaults; track mode.mode) {
              <div class="border-border rounded-md border p-2.5">
                <p class="text-sm font-semibold">{{ mode.mode }}</p>
                @if (mode.description) {
                  <p class="text-muted-foreground text-sm">{{ mode.description }}</p>
                }
                @if (mode['use-case']) {
                  <p class="text-muted-foreground text-xs">
                    <span class="font-medium">Use case:</span> {{ mode['use-case'] }}
                  </p>
                }
              </div>
            }
          </div>
        </section>
      }

      @if (data().initializationDeclaration; as declaration) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Initialization Declaration</h3>
          <p class="text-sm">{{ declaration }}</p>
        </section>
      }
    </div>
  `,
})
export class AgentSpecializationTab {
  readonly content = input<unknown>(null);

  protected readonly data = computed(() => getSpecializationContent(this.content()));

  protected readonly hasFocus = computed(() => {
    const { primaryFocus, secondaryAwareness, avoidanceBoundary, successDefinition } = this.data();
    return !!primaryFocus || !!secondaryAwareness || !!avoidanceBoundary || !!successDefinition;
  });
}
