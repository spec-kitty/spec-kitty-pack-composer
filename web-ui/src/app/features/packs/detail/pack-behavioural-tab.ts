import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { ArtifactType } from '../models';
import type { CharterItem } from '../../charters/models';
import { ARTIFACT_TYPE_LABELS } from './artifact-types';
import { PackArtifactTable } from './pack-artifact-table';

/**
 * Behavioural tab content (FR-003, FR-004, FR-012): a vertically stacked list
 * of per-type sections — one per grouped type actually present in the pack —
 * each an unmodified `PackArtifactTable` with its own search/sort/
 * category-filter controls intact. Scrolls with the page itself (no inner
 * scroll container) to avoid a nested/double scrollbar.
 *
 * "Dumb" on purpose: the caller (`PackArtifactTabs`) computes which member
 * types are actually present (FR-005) and passes that already-filtered list
 * in via `memberTypes`; this component just renders whatever it's given, in
 * the order given.
 */
@Component({
  selector: 'app-pack-behavioural-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PackArtifactTable],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-8" role="group" aria-label="Behavioural artifacts">
      @for (type of memberTypes(); track type) {
        <section class="flex flex-col gap-3">
          <h2 class="text-lg font-semibold">{{ labelFor(type) }}</h2>
          <app-pack-artifact-table
            [packId]="packId()"
            [artifactType]="type"
            [reloadToken]="reloadToken()"
            [membership]="membership()"
            (membershipChanged)="membershipChanged.emit()"
          />
        </section>
      }
    </div>
  `,
})
export class PackBehaviouralTab {
  readonly packId = input.required<string>();
  readonly memberTypes = input<readonly ArtifactType[]>([]);
  readonly reloadToken = input(0);
  readonly membership = input<Map<string, CharterItem>>(new Map());

  readonly membershipChanged = output<void>();

  protected labelFor(type: ArtifactType): string {
    return ARTIFACT_TYPE_LABELS[type];
  }
}
