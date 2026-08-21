import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { getStyleguideContent } from './artifact-content-types';

/**
 * Styleguide Details renderer (FR-009) — scope, principles, patterns (with
 * visually-distinguished good/bad examples), anti-patterns (same example
 * treatment as patterns, in a separate section), quality test, and an
 * open-ended tooling string-map. Every section is independently `@if`-gated;
 * absent fields are omitted entirely, never rendered as an empty section.
 *
 * Good/bad examples are distinguished by both a colored border/background
 * AND an explicit "Good"/"Avoid" text badge (NFR-003) — never color alone.
 */
@Component({
  selector: 'app-styleguide-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  host: { class: 'block' },
  template: `
    <div class="space-y-6">
      @if (view().scope; as scope) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Scope</h3>
          <p class="text-muted-foreground text-sm whitespace-pre-wrap">{{ scope }}</p>
        </section>
      }

      @if (view().principles.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Principles</h3>
          <ul class="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            @for (principle of view().principles; track principle) {
              <li>{{ principle }}</li>
            }
          </ul>
        </section>
      }

      @if (view().patterns.length > 0) {
        <section class="space-y-3">
          <h3 class="text-sm font-medium">Patterns</h3>
          <div class="space-y-4">
            @for (pattern of view().patterns; track pattern.name) {
              <div class="space-y-2 rounded-lg border p-3">
                <p class="text-sm font-medium">{{ pattern.name }}</p>
                @if (pattern.description) {
                  <p class="text-muted-foreground text-sm whitespace-pre-wrap">
                    {{ pattern.description }}
                  </p>
                }
                @if (pattern.goodExample || pattern.badExample) {
                  <div class="grid gap-2 sm:grid-cols-2">
                    @if (pattern.goodExample; as goodExample) {
                      <div class="border-border bg-muted/40 space-y-1 rounded-md border p-2">
                        <span hlmBadge variant="outline">Good</span>
                        <pre
                          class="overflow-x-auto font-mono text-xs whitespace-pre-wrap"
                        ><code>{{ goodExample }}</code></pre>
                      </div>
                    }
                    @if (pattern.badExample; as badExample) {
                      <div
                        class="border-destructive/50 bg-destructive/10 space-y-1 rounded-md border p-2"
                      >
                        <span hlmBadge variant="destructive">Avoid</span>
                        <pre
                          class="text-destructive overflow-x-auto font-mono text-xs whitespace-pre-wrap"
                        ><code>{{ badExample }}</code></pre>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </section>
      }

      @if (view().antiPatterns.length > 0) {
        <section class="space-y-3">
          <h3 class="text-sm font-medium">Anti-Patterns</h3>
          <div class="space-y-4">
            @for (pattern of view().antiPatterns; track pattern.name) {
              <div class="space-y-2 rounded-lg border p-3">
                <p class="text-sm font-medium">{{ pattern.name }}</p>
                @if (pattern.description) {
                  <p class="text-muted-foreground text-sm whitespace-pre-wrap">
                    {{ pattern.description }}
                  </p>
                }
                @if (pattern.goodExample || pattern.badExample) {
                  <div class="grid gap-2 sm:grid-cols-2">
                    @if (pattern.goodExample; as goodExample) {
                      <div class="border-border bg-muted/40 space-y-1 rounded-md border p-2">
                        <span hlmBadge variant="outline">Good</span>
                        <pre
                          class="overflow-x-auto font-mono text-xs whitespace-pre-wrap"
                        ><code>{{ goodExample }}</code></pre>
                      </div>
                    }
                    @if (pattern.badExample; as badExample) {
                      <div
                        class="border-destructive/50 bg-destructive/10 space-y-1 rounded-md border p-2"
                      >
                        <span hlmBadge variant="destructive">Avoid</span>
                        <pre
                          class="text-destructive overflow-x-auto font-mono text-xs whitespace-pre-wrap"
                        ><code>{{ badExample }}</code></pre>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </section>
      }

      @if (view().qualityTest; as qualityTest) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Quality Test</h3>
          <p class="text-muted-foreground text-sm whitespace-pre-wrap">{{ qualityTest }}</p>
        </section>
      }

      @if (toolingEntries().length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Tooling</h3>
          <dl class="text-sm">
            @for (entry of toolingEntries(); track entry[0]) {
              <div class="border-border/60 flex flex-col gap-0.5 border-b py-1.5 last:border-b-0">
                <dt class="text-muted-foreground text-xs font-medium">{{ entry[0] }}</dt>
                <dd class="whitespace-pre-wrap">{{ entry[1] }}</dd>
              </div>
            }
          </dl>
        </section>
      }
    </div>
  `,
})
export class StyleguideContent {
  readonly content = input<unknown>(null);

  protected readonly view = computed(() => getStyleguideContent(this.content()));

  protected readonly toolingEntries = computed((): [string, string][] =>
    Object.entries(this.view().tooling),
  );
}
