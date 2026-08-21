import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';

import { LoadingIndicator } from '../../../shared';

@Component({
  selector: 'app-charter-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDialogImports, HlmButtonImports, HlmFieldImports, LoadingIndicator],
  template: `
    <hlm-dialog
      [state]="dialogState()"
      [disableClose]="loading()"
      (stateChanged)="onStateChanged($event)"
      (closed)="onDismissed()"
    >
      <hlm-dialog-content *hlmDialogPortal="let ctx" class="sm:max-w-md" [showCloseButton]="!loading()">
        <hlm-dialog-header>
          <h2 hlmDialogTitle>Import charter</h2>
          <p hlmDialogDescription>Choose a charter bundle (.zip) exported from another environment.</p>
        </hlm-dialog-header>

        <hlm-field>
          <label hlmFieldLabel for="charter-import-file">Bundle file</label>
          <input
            id="charter-import-file"
            type="file"
            accept=".zip"
            [disabled]="loading()"
            (change)="onFileSelected($event)"
          />
          @if (error()) {
            <hlm-field-error forceShow>{{ error() }}</hlm-field-error>
          }
        </hlm-field>

        <hlm-dialog-footer>
          <button type="button" hlmBtn variant="outline" hlmDialogClose [disabled]="loading()">
            Cancel
          </button>
          <button type="button" hlmBtn [disabled]="loading() || !selectedFile()" (click)="onSubmit()">
            @if (loading()) {
              <app-loading-indicator label="Importing" [showLabel]="true" />
            } @else {
              Import
            }
          </button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class CharterImportDialog {
  /** Two-way open state for programmatic show/hide. */
  readonly open = model(false);

  /** Parent-driven loading while the import API call is in flight. */
  readonly loading = input(false);

  /** Parent-driven error message (cleared by parent on open/success). */
  readonly error = input<string | null>(null);

  /** Lets the page (not this dialog) perform the actual `importCharter` API call. */
  readonly imported = output<File>();
  readonly cancelled = output<void>();

  protected readonly selectedFile = signal<File | null>(null);

  protected readonly dialogState = computed<BrnDialogState>(() =>
    this.open() ? 'open' : 'closed',
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        this.selectedFile.set(null);
      }
    });
  }

  protected onStateChanged(state: BrnDialogState): void {
    this.open.set(state === 'open');
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  protected onSubmit(): void {
    const file = this.selectedFile();
    if (!file || this.loading()) {
      return;
    }
    this.imported.emit(file);
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
