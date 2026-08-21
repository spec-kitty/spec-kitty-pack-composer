import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { AgentDetailTextSection } from '../agent-detail/agent-detail-text-section';
import { getProcedureContent } from './artifact-content-types';

/**
 * Procedure Details renderer (FR-008) — Purpose, Entry/Exit Condition,
 * Steps (each with a visible actor badge — hard requirement per spec's
 * acceptance scenario 6), Anti-Patterns (name + description, visually
 * distinguished from Steps), Notes. Absent fields render nothing.
 */
@Component({
  selector: 'app-procedure-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports, AgentDetailTextSection],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      <app-agent-detail-text-section heading="Purpose" [description]="view().purpose" />

      @if (view().entryCondition || view().exitCondition) {
        <section class="grid gap-3 sm:grid-cols-2">
          @if (view().entryCondition; as entryCondition) {
            <div class="space-y-1">
              <h3 class="text-sm font-medium">Entry Condition</h3>
              <p class="text-muted-foreground text-sm whitespace-pre-wrap">{{ entryCondition }}</p>
            </div>
          }
          @if (view().exitCondition; as exitCondition) {
            <div class="space-y-1">
              <h3 class="text-sm font-medium">Exit Condition</h3>
              <p class="text-muted-foreground text-sm whitespace-pre-wrap">{{ exitCondition }}</p>
            </div>
          }
        </section>
      }

      @if (view().steps.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Steps</h3>
          <div class="space-y-2">
            @for (step of view().steps; track $index) {
              <div class="border-border rounded-md border p-2.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-sm font-semibold">{{ step.title }}</span>
                  @if (step.actor; as actor) {
                    <span hlmBadge variant="outline">{{ actor }}</span>
                  }
                </div>
                @if (step.description) {
                  <p class="text-muted-foreground mt-1 text-sm">{{ step.description }}</p>
                }
              </div>
            }
          </div>
        </section>
      }

      @if (view().antiPatterns.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Anti-Patterns</h3>
          <div class="space-y-2">
            @for (antiPattern of view().antiPatterns; track $index) {
              <div class="border-destructive/40 bg-destructive/5 rounded-md border p-2.5">
                <p class="text-sm font-semibold">{{ antiPattern.name }}</p>
                @if (antiPattern.description) {
                  <p class="text-muted-foreground mt-1 text-sm">{{ antiPattern.description }}</p>
                }
              </div>
            }
          </div>
        </section>
      }

      <app-agent-detail-text-section heading="Notes" [description]="view().notes" />
    </div>
  `,
})
export class ProcedureContent {
  readonly content = input<unknown>(null);

  protected readonly view = computed(() => getProcedureContent(this.content()));
}
