import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { ConfirmDialog, type ConfirmDialogResult } from '../../../shared';
import type { Pack } from '../models';

/**
 * Remove confirmation for overview rows.
 * Disk-delete toggle is shown only for local-origin packs (FR-014 / FR-015).
 */
@Component({
  selector: 'app-pack-remove-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialog],
  template: `
    <app-confirm-dialog
      [(open)]="open"
      title="Remove pack"
      [description]="description()"
      confirmLabel="Remove"
      cancelLabel="Cancel"
      confirmVariant="destructive"
      [showToggle]="isLocal()"
      toggleLabel="Also delete files from disk"
      [(toggleValue)]="deleteFiles"
      (confirmed)="onConfirmed($event)"
      (cancelled)="onCancelled($event)"
    />
  `,
})
export class PackRemoveDialog {
  readonly open = model(false);

  /** Pack targeted for removal; drives toggle visibility and copy. */
  readonly pack = input<Pack | null>(null);

  readonly confirmed = output<ConfirmDialogResult>();
  readonly cancelled = output<ConfirmDialogResult>();

  /** Disk-delete toggle value (default off). Reset when a new pack is targeted. */
  readonly deleteFiles = model(false);

  protected readonly isLocal = computed(() => this.pack()?.origin === 'local');

  protected readonly description = computed(() => {
    const pack = this.pack();
    if (!pack) {
      return 'Remove this pack from the index?';
    }
    return `Remove “${pack.name}” from the index? This deletes the cached database record.`;
  });

  protected onConfirmed(result: ConfirmDialogResult): void {
    this.confirmed.emit(result);
  }

  protected onCancelled(result: ConfirmDialogResult): void {
    this.cancelled.emit(result);
  }
}
