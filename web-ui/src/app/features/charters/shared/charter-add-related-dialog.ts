import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal } from '@angular/core';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';

import type { RelatedItemCandidate } from '../models';

const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  directive: 'Directive',
  tactic: 'Tactic',
  procedure: 'Procedure',
  styleguide: 'Styleguide',
  toolguide: 'Toolguide',
  profile: 'Profile',
  mission_step_contract: 'Mission Step Contract',
  template: 'Template',
  glossary: 'Glossary',
};

/**
 * Confirmation dialog for FR-026: adding a directive that other artifacts
 * reference back to offers those related items for the maintainer to
 * review, pre-checked, before anything is added. Cancelling adds nothing at
 * all — not even the directive itself — since the maintainer never
 * confirmed the action.
 */
@Component({
  selector: 'app-charter-add-related-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDialogImports, HlmButtonImports, HlmCheckboxImports, HlmBadgeImports],
  template: `
    <hlm-dialog
      [state]="dialogState()"
      [disableClose]="loading()"
      (stateChanged)="onStateChanged($event)"
      (closed)="onDismissed()"
    >
      <hlm-dialog-content *hlmDialogPortal="let ctx" class="sm:max-w-lg" [showCloseButton]="!loading()">
        <hlm-dialog-header>
          <h2 hlmDialogTitle>Add related items?</h2>
          <p hlmDialogDescription>
            @if (relatedItems().length === 1) {
              1 other artifact references “{{ targetName() }}”. Add it together with the directive?
            } @else {
              {{ relatedItems().length }} other artifacts reference “{{ targetName() }}”. Add them together with the
              directive?
            }
          </p>
        </hlm-dialog-header>

        <ul class="max-h-72 space-y-1 overflow-y-auto py-2" role="list">
          @for (item of relatedItems(); track item.pack_artifact_id) {
            <li class="flex items-center gap-3 rounded-md px-2 py-1.5">
              <hlm-checkbox
                [inputId]="'related-item-' + item.pack_artifact_id"
                [checked]="isChecked(item.pack_artifact_id)"
                [disabled]="loading() || item.already_in_charter"
                [attr.aria-label]="'Include ' + item.name"
                (checkedChange)="onCheckedChange(item.pack_artifact_id, $event)"
              />
              <label [for]="'related-item-' + item.pack_artifact_id" class="flex flex-1 flex-col text-sm">
                <span class="flex items-center gap-2">
                  <span hlmBadge variant="outline">{{ artifactTypeLabel(item.artifact_type) }}</span>
                  <span class="font-medium">{{ item.name }}</span>
                </span>
                <span class="text-muted-foreground text-xs">
                  {{ item.pack_name }}
                  @if (item.already_in_charter) {
                    · Already in charter
                  }
                </span>
              </label>
            </li>
          }
        </ul>

        <hlm-dialog-footer>
          <button type="button" hlmBtn variant="outline" [disabled]="loading()" (click)="onCancel()">
            Cancel
          </button>
          <button type="button" hlmBtn [disabled]="loading()" (click)="onConfirm()">
            @if (loading()) {
              Adding…
            } @else {
              Add {{ selectedCount() }} item{{ selectedCount() === 1 ? '' : 's' }}
            }
          </button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class CharterAddRelatedDialog {
  /** Two-way open state for programmatic show/hide. */
  readonly open = model(false);

  /** Name of the directive being added, shown in the description. */
  readonly targetName = input<string>('');

  /** Artifacts referencing the target directive back (FR-026). */
  readonly relatedItems = input<RelatedItemCandidate[]>([]);

  /** Parent-driven loading while the bulk-add API call is in flight. */
  readonly loading = input(false);

  /** Emits the `pack_artifact_id`s of every related item the maintainer left checked (target directive is added separately by the caller). */
  readonly confirmed = output<string[]>();

  /** Emitted on Cancel/dismiss — the caller must not add anything, including the directive. */
  readonly cancelled = output<void>();

  private readonly checkedIds = signal<Set<string>>(new Set());

  protected readonly dialogState = computed<BrnDialogState>(() => (this.open() ? 'open' : 'closed'));

  protected readonly selectedCount = computed(() => this.checkedIds().size + 1);

  constructor() {
    // Pre-check every not-yet-in-charter related item whenever a fresh list arrives.
    effect(() => {
      const items = this.relatedItems();
      this.checkedIds.set(new Set(items.filter((item) => !item.already_in_charter).map((item) => item.pack_artifact_id)));
    });
  }

  protected isChecked(id: string): boolean {
    return this.checkedIds().has(id);
  }

  protected artifactTypeLabel(type: string): string {
    return ARTIFACT_TYPE_LABELS[type] ?? type;
  }

  protected onCheckedChange(id: string, checked: boolean): void {
    this.checkedIds.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  protected onStateChanged(state: BrnDialogState): void {
    this.open.set(state === 'open');
  }

  protected onConfirm(): void {
    if (this.loading()) {
      return;
    }
    this.confirmed.emit(Array.from(this.checkedIds()));
  }

  protected onCancel(): void {
    if (this.loading()) {
      return;
    }
    this.open.set(false);
    this.cancelled.emit();
  }

  protected onDismissed(): void {
    if (this.loading()) {
      return;
    }
    if (this.open()) {
      this.open.set(false);
      this.cancelled.emit();
    }
  }
}
