import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { ConfirmDialog, type ConfirmDialogResult } from '../../../shared';
import type { CharterSummary } from '../models';

/**
 * Delete confirmation for overview rows. Charters have no on-disk artifacts, so unlike
 * `pack-remove-dialog.ts` there is no disk-delete toggle (`showToggle` stays unset).
 * When the targeted charter is the active one, the description additionally warns that
 * no charter will be active afterward (FR-005's edge case).
 */
@Component({
  selector: 'app-charter-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialog],
  template: `
    <app-confirm-dialog
      [(open)]="open"
      title="Delete charter"
      [description]="description()"
      confirmLabel="Delete"
      cancelLabel="Cancel"
      confirmVariant="destructive"
      (confirmed)="onConfirmed($event)"
      (cancelled)="onCancelled($event)"
    />
  `,
})
export class CharterDeleteDialog {
  readonly open = model(false);

  /** Charter targeted for deletion; drives copy, including the active-charter warning. */
  readonly charter = input<CharterSummary | null>(null);

  readonly confirmed = output<ConfirmDialogResult>();
  readonly cancelled = output<ConfirmDialogResult>();

  protected readonly description = computed(() => {
    const charter = this.charter();
    if (!charter) {
      return 'Delete this charter?';
    }
    if (charter.active) {
      return `Delete “${charter.name}”? This is the active charter — after deleting it, no charter will be active until you activate another one.`;
    }
    return `Delete “${charter.name}”? This cannot be undone.`;
  });

  protected onConfirmed(result: ConfirmDialogResult): void {
    this.confirmed.emit(result);
  }

  protected onCancelled(result: ConfirmDialogResult): void {
    this.cancelled.emit(result);
  }
}
