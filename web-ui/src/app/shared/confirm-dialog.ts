import { Component, computed, input, model, output } from '@angular/core';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';

export interface ConfirmDialogResult {
  confirmed: boolean;
  /** Value of the optional boolean toggle (e.g. delete files from disk). */
  toggleValue: boolean;
}

/**
 * Reusable confirm dialog with optional boolean toggle slot (disk-delete for WP06 remove).
 * Control visibility via `open` model (`true`/`false`).
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [HlmAlertDialogImports, HlmSwitchImports, HlmLabelImports],
  template: `
    <hlm-alert-dialog
      [state]="dialogState()"
      (stateChanged)="onStateChanged($event)"
      (closed)="onDismissed()"
    >
      <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>{{ title() }}</h2>
          @if (description()) {
            <p hlmAlertDialogDescription>{{ description() }}</p>
          }
        </hlm-alert-dialog-header>

        @if (showToggle()) {
          <div class="flex items-center gap-3 py-2">
            <hlm-switch
              [checked]="toggleValue()"
              (checkedChange)="toggleValue.set($event)"
              [inputId]="toggleId"
              [aria-label]="toggleLabel()"
            />
            <label hlmLabel [for]="toggleId">{{ toggleLabel() }}</label>
          </div>
        }

        <hlm-alert-dialog-footer>
          <button type="button" hlmAlertDialogCancel (click)="onCancel()">
            {{ cancelLabel() }}
          </button>
          <button
            type="button"
            hlmAlertDialogAction
            [variant]="confirmVariant()"
            (click)="onConfirm()"
          >
            {{ confirmLabel() }}
          </button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class ConfirmDialog {
  private static nextId = 0;

  protected readonly toggleId = `app-confirm-toggle-${ConfirmDialog.nextId++}`;

  /** Two-way open state for programmatic show/hide. */
  readonly open = model(false);

  readonly title = input.required<string>();
  readonly description = input('');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly confirmVariant = input<'default' | 'destructive'>('default');

  /** When true, render the optional boolean toggle (disk-delete). */
  readonly showToggle = input(false);
  readonly toggleLabel = input('Also delete files from disk');
  readonly toggleValue = model(false);

  readonly confirmed = output<ConfirmDialogResult>();
  readonly cancelled = output<ConfirmDialogResult>();

  protected readonly dialogState = computed<BrnDialogState>(() =>
    this.open() ? 'open' : 'closed',
  );

  protected onStateChanged(state: BrnDialogState): void {
    this.open.set(state === 'open');
  }

  protected onConfirm(): void {
    const result: ConfirmDialogResult = {
      confirmed: true,
      toggleValue: this.toggleValue(),
    };
    this.confirmed.emit(result);
    this.open.set(false);
  }

  protected onCancel(): void {
    this.emitCancelled();
    this.open.set(false);
  }

  protected onDismissed(): void {
    // Backdrop/escape — treat as cancel if still marked open.
    if (this.open()) {
      this.emitCancelled();
      this.open.set(false);
    }
  }

  private emitCancelled(): void {
    this.cancelled.emit({
      confirmed: false,
      toggleValue: this.toggleValue(),
    });
  }
}
