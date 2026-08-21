import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideDownload,
  lucideEllipsisVertical,
  lucideExternalLink,
  lucidePencil,
  lucideStar,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { LoadingIndicator } from '../../../shared';
import type { CharterSummary } from '../models';

@Component({
  selector: 'app-charter-table',
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
      lucidePencil,
      lucideStar,
      lucideTrash2,
    }),
  ],
  host: {
    class: 'block w-full',
  },
  template: `
    <div hlmTableContainer>
      <table hlmTable class="table-fixed" aria-label="Charters">
        <colgroup>
          <col />
          <col class="w-28" />
          <col class="w-32" />
          <col class="w-28" />
          <col class="w-32" />
          <col class="w-32" />
          <col class="w-24" />
        </colgroup>
        <thead hlmTableHeader>
          <tr hlmTableRow>
            <th hlmTableHead>Name</th>
            <th hlmTableHead>Active</th>
            <th hlmTableHead>Enabled items</th>
            <th hlmTableHead>Conflicts</th>
            <th hlmTableHead>Created</th>
            <th hlmTableHead>Updated</th>
            <th hlmTableHead class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody hlmTableBody>
          @for (charter of charters(); track charter.id) {
            <tr hlmTableRow>
              <td hlmTableCell class="overflow-hidden font-medium" [title]="charter.name">
                <a
                  class="text-foreground block truncate hover:underline focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
                  [routerLink]="['/charters', charter.id]"
                >
                  {{ charter.name }}
                </a>
              </td>
              <td hlmTableCell>
                @if (charter.active) {
                  <span hlmBadge variant="default">Active</span>
                } @else {
                  <span hlmBadge variant="secondary">Inactive</span>
                }
              </td>
              <td hlmTableCell>{{ charter.enabled_item_count ?? 0 }}</td>
              <td hlmTableCell>
                @if (charter.has_conflicts) {
                  <button
                    type="button"
                    hlmBtn
                    variant="ghost"
                    size="icon-xs"
                    class="inline-flex items-center gap-1 align-middle text-amber-600 dark:text-amber-400"
                    hlmTooltip="This charter has conflicting enabled items."
                    aria-label="Has conflicts: this charter has conflicting enabled items."
                  >
                    <ng-icon name="lucideCircleAlert" aria-hidden="true" />
                    <span class="text-xs font-medium">Conflicts</span>
                  </button>
                } @else {
                  <span class="text-muted-foreground text-xs">None</span>
                }
              </td>
              <td hlmTableCell>{{ charter.created | date: 'mediumDate' }}</td>
              <td hlmTableCell>{{ charter.updated | date: 'mediumDate' }}</td>
              <td hlmTableCell>
                <div class="flex items-center justify-end">
                  @if (isBusy(charter)) {
                    <app-loading-indicator [label]="busyLabel(charter)" [showLabel]="false" />
                  } @else {
                    <button
                      type="button"
                      hlmBtn
                      variant="ghost"
                      size="icon"
                      [hlmDropdownMenuTrigger]="rowActions"
                      [hlmDropdownMenuTriggerData]="{ $implicit: charter }"
                      align="end"
                      [attr.aria-label]="'Actions for ' + charter.name"
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

    <ng-template #rowActions let-charter>
      <hlm-dropdown-menu class="w-40">
        <hlm-dropdown-menu-group>
          <a hlmDropdownMenuItem [routerLink]="['/charters', charter.id]">
            <ng-icon name="lucideExternalLink" aria-hidden="true" />
            Open
          </a>
          <button type="button" hlmDropdownMenuItem (triggered)="renameCharter.emit(charter)">
            <ng-icon name="lucidePencil" aria-hidden="true" />
            Rename
          </button>
          <button
            type="button"
            hlmDropdownMenuItem
            [disabled]="charter.active"
            (triggered)="activateCharter.emit(charter)"
          >
            <ng-icon name="lucideStar" aria-hidden="true" />
            Activate
          </button>
          <button type="button" hlmDropdownMenuItem (triggered)="exportCharter.emit(charter)">
            <ng-icon name="lucideDownload" aria-hidden="true" />
            Export
          </button>
        </hlm-dropdown-menu-group>
        <hlm-dropdown-menu-separator />
        <hlm-dropdown-menu-group>
          <button
            type="button"
            hlmDropdownMenuItem
            variant="destructive"
            (triggered)="deleteCharter.emit(charter)"
          >
            <ng-icon name="lucideTrash2" aria-hidden="true" />
            Delete
          </button>
        </hlm-dropdown-menu-group>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class CharterTable {
  readonly charters = input.required<CharterSummary[]>();

  /** Charter id whose activate call is in flight — shows a spinner in place of the actions menu (FR-024). */
  readonly activatingCharterId = input<string | null>(null);
  /** Charter id whose export call is in flight — shows a spinner in place of the actions menu (FR-024). */
  readonly exportingCharterId = input<string | null>(null);
  /** Charter id whose delete call is in flight — shows a spinner in place of the actions menu (FR-024). */
  readonly removingCharterId = input<string | null>(null);

  readonly activateCharter = output<CharterSummary>();
  readonly renameCharter = output<CharterSummary>();
  readonly deleteCharter = output<CharterSummary>();
  readonly exportCharter = output<CharterSummary>();

  protected isBusy(charter: CharterSummary): boolean {
    return (
      this.activatingCharterId() === charter.id ||
      this.exportingCharterId() === charter.id ||
      this.removingCharterId() === charter.id
    );
  }

  protected busyLabel(charter: CharterSummary): string {
    if (this.removingCharterId() === charter.id) {
      return 'Deleting charter';
    }
    if (this.activatingCharterId() === charter.id) {
      return 'Activating charter';
    }
    return 'Exporting charter';
  }
}
