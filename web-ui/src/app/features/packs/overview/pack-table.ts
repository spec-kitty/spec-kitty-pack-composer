import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideDownload,
  lucideEllipsisVertical,
  lucideExternalLink,
  lucideRefreshCw,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { LoadingIndicator } from '../../../shared';
import type { Pack, ParentStatusMap } from '../models';

@Component({
  selector: 'app-pack-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmTableImports,
    HlmTooltipImports,
    LoadingIndicator,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideDownload,
      lucideEllipsisVertical,
      lucideExternalLink,
      lucideRefreshCw,
      lucideTrash2,
    }),
  ],
  host: {
    class: 'block w-full',
  },
  template: `
    <div hlmTableContainer>
      <table hlmTable aria-label="Indexed packs">
        <thead hlmTableHeader>
          <tr hlmTableRow>
            <th hlmTableHead>Name</th>
            <th hlmTableHead>Origin</th>
            <th hlmTableHead>Version</th>
            <th hlmTableHead>Import date</th>
            <th hlmTableHead>Last updated</th>
            <th hlmTableHead class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody hlmTableBody>
          @for (pack of packs(); track pack.id) {
            <tr hlmTableRow>
              <td hlmTableCell class="font-medium">
                <a
                  class="text-foreground hover:underline focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
                  [routerLink]="['/packs', pack.id]"
                >
                  {{ pack.name }}
                </a>
                @if (isMissingParent(pack)) {
                  <button
                    type="button"
                    hlmBtn
                    variant="ghost"
                    size="icon-xs"
                    class="ms-1 inline-flex align-middle text-amber-600 dark:text-amber-400"
                    [hlmTooltip]="tooltipText(pack)"
                    [attr.aria-label]="tooltipText(pack)"
                  >
                    <ng-icon name="lucideCircleAlert" aria-hidden="true" />
                  </button>
                }
              </td>
              <td hlmTableCell>
                <span hlmBadge variant="secondary" class="capitalize">{{ pack.origin }}</span>
              </td>
              <td hlmTableCell>{{ pack.version || '—' }}</td>
              <td hlmTableCell>{{ pack.imported_at | date: 'mediumDate' }}</td>
              <td hlmTableCell>{{ pack.updated_at | date: 'mediumDate' }}</td>
              <td hlmTableCell>
                <div class="flex items-center justify-end">
                  @if (isBusy(pack)) {
                    <app-loading-indicator [label]="busyLabel(pack)" [showLabel]="false" />
                  } @else {
                    <button
                      type="button"
                      hlmBtn
                      variant="ghost"
                      size="icon"
                      [hlmDropdownMenuTrigger]="rowActions"
                      [hlmDropdownMenuTriggerData]="{ $implicit: pack }"
                      align="end"
                      [attr.aria-label]="'Actions for ' + pack.name"
                    >
                      <ng-icon name="lucideEllipsisVertical" aria-hidden="true" />
                    </button>
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <ng-template #rowActions let-pack>
      <hlm-dropdown-menu class="w-40">
        <hlm-dropdown-menu-group>
          <a hlmDropdownMenuItem [routerLink]="['/packs', pack.id]">
            <ng-icon name="lucideExternalLink" aria-hidden="true" />
            Open
          </a>
          <button type="button" hlmDropdownMenuItem (triggered)="refreshPack.emit(pack)">
            <ng-icon name="lucideRefreshCw" aria-hidden="true" />
            Refresh
          </button>
          <button type="button" hlmDropdownMenuItem (triggered)="exportPack.emit(pack)">
            <ng-icon name="lucideDownload" aria-hidden="true" />
            Export
          </button>
        </hlm-dropdown-menu-group>
        @if (pack.origin !== 'built-in') {
          <hlm-dropdown-menu-separator />
          <hlm-dropdown-menu-group>
            <button
              type="button"
              hlmDropdownMenuItem
              variant="destructive"
              (triggered)="removePack.emit(pack)"
            >
              <ng-icon name="lucideTrash2" aria-hidden="true" />
              Remove
            </button>
          </hlm-dropdown-menu-group>
        }
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class PackTable {
  readonly packs = input.required<Pack[]>();
  /** Pack id whose export is in flight — shows a spinner in place of the actions menu (FR-024). */
  readonly exportingPackId = input<string | null>(null);
  /** Pack id whose removal is in flight — shows a spinner in place of the actions menu (FR-024). */
  readonly removingPackId = input<string | null>(null);
  /** Pack id whose refresh is in flight — shows a spinner in place of the actions menu (FR-024). */
  readonly refreshingPackId = input<string | null>(null);
  /** Parent chain status per pack id, driving the missing-parent warning (FR-003/FR-009/FR-010). */
  readonly parentStatus = input.required<ParentStatusMap>();

  readonly refreshPack = output<Pack>();
  readonly exportPack = output<Pack>();
  readonly removePack = output<Pack>();

  protected isBusy(pack: Pack): boolean {
    return (
      this.exportingPackId() === pack.id ||
      this.removingPackId() === pack.id ||
      this.refreshingPackId() === pack.id
    );
  }

  protected busyLabel(pack: Pack): string {
    if (this.removingPackId() === pack.id) {
      return 'Removing pack';
    }
    if (this.refreshingPackId() === pack.id) {
      return 'Refreshing pack';
    }
    return 'Exporting pack';
  }

  protected isMissingParent(pack: Pack): boolean {
    const status = this.parentStatus()[pack.id]?.status;
    return status === 'missing' || status === 'broken-ancestor';
  }

  protected tooltipText(pack: Pack): string {
    const status = this.parentStatus()[pack.id];
    const ref = status?.broken_pack_name ?? status?.broken_ref ?? 'the parent pack';
    return `Missing parent: ${ref} is not imported, so inherited data is incomplete.`;
  }
}
