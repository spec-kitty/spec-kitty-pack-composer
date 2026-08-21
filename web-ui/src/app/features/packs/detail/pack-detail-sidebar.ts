import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HlmCardImports } from '@spartan-ng/helm/card';

import type { Pack, PackStats, PackVersionHistory } from '../models';
import { ARTIFACT_TYPE_LABELS, ARTIFACT_TYPE_ORDER } from './artifact-types';

/**
 * Detail sidebar: Versions (desc), Stats — no People card (FR-022).
 */
@Component({
  selector: 'app-pack-detail-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, HlmCardImports],
  host: {
    class: 'flex flex-col gap-4',
  },
  template: `
    <section hlmCard>
      <div hlmCardHeader>
        <h2 hlmCardTitle>Versions</h2>
        <p hlmCardDescription>Observed across imports and refreshes</p>
      </div>
      <div hlmCardContent>
        @if (versions().length > 0) {
          <ul class="space-y-3">
            @for (entry of versions(); track entry.id) {
              <li class="flex flex-col gap-0.5 text-sm">
                <span class="font-medium">v{{ entry.version }}</span>
                <span class="text-muted-foreground">
                  <time [attr.datetime]="entry.observed_at">
                    {{ entry.observed_at | date: 'medium' }}
                  </time>
                  · {{ entry.source }}
                </span>
              </li>
            }
          </ul>
        } @else {
          <p class="text-muted-foreground text-sm">No version history yet.</p>
        }
      </div>
    </section>

    <section hlmCard>
      <div hlmCardHeader>
        <h2 hlmCardTitle>Stats</h2>
        <p hlmCardDescription>Artifact counts by type</p>
      </div>
      <div hlmCardContent>
        <dl class="space-y-2 text-sm">
          @for (row of statRows(); track row.label) {
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">{{ row.label }}</dt>
              <dd class="font-medium tabular-nums">{{ row.count }}</dd>
            </div>
          }
          <div class="border-border flex items-center justify-between gap-2 border-t pt-2">
            <dt class="font-medium">Total</dt>
            <dd class="font-semibold tabular-nums">{{ totalCount() }}</dd>
          </div>
        </dl>
      </div>
    </section>
  `,
})
export class PackDetailSidebar {
  readonly pack = input.required<Pack>();
  readonly versions = input<PackVersionHistory[]>([]);

  protected readonly stats = computed((): PackStats => {
    return this.pack().stats ?? { total: 0, by_type: {} };
  });

  protected readonly totalCount = computed(() => this.stats().total ?? 0);

  protected readonly statRows = computed(() => {
    const byType = this.stats().by_type ?? {};
    return ARTIFACT_TYPE_ORDER.filter((type) => (byType[type] ?? 0) > 0).map((type) => ({
      label: ARTIFACT_TYPE_LABELS[type],
      count: byType[type] ?? 0,
    }));
  });
}
