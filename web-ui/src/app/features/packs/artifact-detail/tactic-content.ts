import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AgentDetailTextSection } from '../agent-detail/agent-detail-text-section';
import { getTacticContent } from './artifact-content-types';

/**
 * Tactic Details renderer (FR-007) — Purpose, Steps (titled items with an
 * optional description, order preserved), Failure Modes (bulleted list of
 * full-sentence warnings, not chips). Absent fields render nothing.
 */
@Component({
  selector: 'app-tactic-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AgentDetailTextSection],
  host: { class: 'block' },
  template: `
    <div class="space-y-4">
      <app-agent-detail-text-section heading="Purpose" [description]="view().purpose" />

      @if (view().steps.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Steps</h3>
          <div class="space-y-2">
            @for (step of view().steps; track $index) {
              <div class="border-border rounded-md border p-2.5">
                <p class="text-sm font-semibold">{{ step.title }}</p>
                @if (step.description) {
                  <p class="text-muted-foreground mt-1 text-sm">{{ step.description }}</p>
                }
              </div>
            }
          </div>
        </section>
      }

      @if (view().failureModes.length > 0) {
        <section class="space-y-1.5">
          <h3 class="text-sm font-medium">Failure Modes</h3>
          <ul class="list-disc space-y-1.5 pl-5 text-sm">
            @for (failureMode of view().failureModes; track failureMode) {
              <li>{{ failureMode }}</li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class TacticContent {
  readonly content = input<unknown>(null);

  protected readonly view = computed(() => getTacticContent(this.content()));
}
