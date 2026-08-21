import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideLoader2, lucideTrash2 } from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import type { CharterGridCard as CharterGridCardModel } from '../models';

/**
 * Single-card rendering + interaction unit for the Charter Detail grid (FR-013–FR-015,
 * FR-022). Purely presentational — never calls the API directly, only emits intent for
 * the container (`charter-detail.page.ts`) to wire to `ChartersApiService`, matching
 * `pack-table.ts`'s outputs-only "dumb card, smart container" split.
 *
 * Renders one of 5 distinct states:
 * - Not in charter → "Add to Charter" action.
 * - In charter, no issues → enable/disable switch, plus a "Remove" action (FR-010: hard delete).
 * - Missing source → switch genuinely disabled + non-color-only "Missing source" cue.
 * - Conflicting, currently disabled → non-color-only "Conflict" badge + one-click resolve action.
 * - Conflicting, currently enabled → "Conflict" badge only (already winning, no redundant action).
 */
@Component({
  selector: 'app-charter-grid-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmBadgeImports, HlmButtonImports, HlmSwitchImports, HlmTooltipImports],
  providers: [provideIcons({ lucideCircleAlert, lucideLoader2, lucideTrash2 })],
  host: {
    class: 'block h-full',
  },
  template: `
    <div class="flex h-full flex-col gap-3 rounded-lg border p-4">
      <div class="min-w-0">
        <p class="truncate text-sm font-medium" [title]="card().artifact_name">
          {{ card().artifact_name }}
        </p>
        <p class="text-muted-foreground truncate text-xs" [title]="card().pack_name">
          {{ card().pack_name }}
        </p>
      </div>

      @if (card().missing_source || card().conflicting) {
        <div class="flex flex-wrap items-center gap-2">
          @if (card().missing_source) {
            <span
              hlmBadge
              variant="outline"
              tabindex="0"
              class="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
              [hlmTooltip]="missingSourceTooltip"
              [attr.aria-label]="missingSourceTooltip"
            >
              <ng-icon name="lucideCircleAlert" aria-hidden="true" />
              <span>Missing source</span>
            </span>
          }
          @if (card().conflicting) {
            <span
              hlmBadge
              variant="outline"
              tabindex="0"
              class="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
              [hlmTooltip]="conflictTooltip"
              [attr.aria-label]="conflictTooltip"
            >
              <ng-icon name="lucideCircleAlert" aria-hidden="true" />
              <span>Conflict</span>
            </span>
          }
        </div>
      }

      <div class="mt-auto flex items-center justify-between gap-2">
        @if (!card().in_charter) {
          <button
            type="button"
            hlmBtn
            size="sm"
            class="min-w-28 justify-center"
            [disabled]="!card().pack_artifact_id || busy()"
            [attr.aria-label]="addAriaLabel()"
            [attr.aria-busy]="busy()"
            [hlmTooltip]="missingPackArtifactTooltip"
            [tooltipDisabled]="!!card().pack_artifact_id || busy()"
            (click)="add.emit(card())"
          >
            @if (busy()) {
              <ng-icon name="lucideLoader2" class="animate-spin" aria-hidden="true" />
              <span class="sr-only">Adding…</span>
            } @else {
              Add to Charter
            }
          </button>
        } @else {
          <div class="flex items-center gap-2">
            <hlm-switch
              size="sm"
              [checked]="card().enabled"
              [disabled]="card().missing_source"
              [attr.aria-label]="switchAriaLabel()"
              (checkedChange)="onToggle($event)"
            />
            <span class="text-sm">{{ card().enabled ? 'Enabled' : 'Disabled' }}</span>
          </div>
          <div class="flex items-center gap-2">
            @if (showResolveAction()) {
              <button
                type="button"
                hlmBtn
                variant="outline"
                size="sm"
                (click)="resolveConflict.emit(card())"
              >
                Use this source
              </button>
            }
            <button
              type="button"
              hlmBtn
              variant="ghost"
              size="icon"
              [disabled]="removing()"
              [attr.aria-label]="removeAriaLabel()"
              [attr.aria-busy]="removing()"
              [hlmTooltip]="removeTooltip"
              (click)="onRemove()"
            >
              @if (removing()) {
                <ng-icon name="lucideLoader2" class="animate-spin" aria-hidden="true" />
                <span class="sr-only">Removing…</span>
              } @else {
                <ng-icon name="lucideTrash2" aria-hidden="true" />
              }
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class CharterGridCard {
  readonly card = input.required<CharterGridCardModel>();
  /** True while this specific card's "Add to Charter" request is in flight. */
  readonly busy = input<boolean>(false);
  /** True while this specific card's "Remove" request is in flight. */
  readonly removing = input<boolean>(false);

  /** `enabled` is the switch's new value; the container resolves `card().charter_item_id`. */
  readonly toggle = output<{ card: CharterGridCardModel; enabled: boolean }>();
  readonly add = output<CharterGridCardModel>();
  readonly resolveConflict = output<CharterGridCardModel>();
  /** Requests removing this item from the charter entirely (FR-010: hard delete, not just disable). */
  readonly remove = output<CharterGridCardModel>();

  protected readonly missingSourceTooltip =
    'Missing source: the pack providing this artifact was removed. Re-import it to toggle this item.';
  protected readonly conflictTooltip =
    'Conflict: another enabled item shares this artifact identity.';
  protected readonly missingPackArtifactTooltip =
    'Cannot add: this artifact has no resolvable pack artifact record.';
  protected readonly removeTooltip = 'Remove this item from the charter.';

  /** Only the losing (disabled) side of a conflict offers the one-click resolve action. */
  protected readonly showResolveAction = computed(
    () => this.card().conflicting && !this.card().enabled && !this.card().missing_source,
  );

  protected addAriaLabel(): string {
    const card = this.card();
    return card.pack_artifact_id
      ? `Add ${card.artifact_name} to charter`
      : `Add ${card.artifact_name} to charter — unavailable, missing pack artifact record`;
  }

  protected switchAriaLabel(): string {
    const card = this.card();
    if (card.missing_source) {
      return `${card.artifact_name}: toggle disabled — missing source`;
    }
    return `${card.artifact_name}: ${card.enabled ? 'enabled' : 'disabled'}`;
  }

  protected onToggle(enabled: boolean): void {
    this.toggle.emit({ card: this.card(), enabled });
  }

  protected onRemove(): void {
    if (this.removing()) {
      return;
    }
    this.remove.emit(this.card());
  }

  protected removeAriaLabel(): string {
    const card = this.card();
    return this.removing()
      ? `Removing ${card.artifact_name} from charter…`
      : `Remove ${card.artifact_name} from charter`;
  }
}
