import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';

import { LoadingIndicator } from '../../../shared';

@Component({
  selector: 'app-pack-import-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    LoadingIndicator,
  ],
  template: `
    <hlm-dialog
      [state]="dialogState()"
      [disableClose]="loading()"
      (stateChanged)="onStateChanged($event)"
      (closed)="onDismissed()"
    >
      <hlm-dialog-content *hlmDialogPortal="let ctx" class="sm:max-w-md" [showCloseButton]="!loading()">
        <hlm-dialog-header>
          <h2 hlmDialogTitle>Import pack</h2>
          <p hlmDialogDescription>
            Enter an absolute filesystem path to a local doctrine pack directory.
          </p>
        </hlm-dialog-header>

        <hlm-field>
          <label hlmFieldLabel for="pack-import-path">Source path</label>
          <input
            hlmInput
            id="pack-import-path"
            type="text"
            name="source-path"
            autocomplete="off"
            placeholder="/var/packs/example/pack"
            [disabled]="loading()"
            [value]="sourcePath()"
            (input)="onPathInput($event)"
          />
          @if (error()) {
            <hlm-field-error forceShow>{{ error() }}</hlm-field-error>
          }
        </hlm-field>

        <hlm-dialog-footer>
          <button
            type="button"
            hlmBtn
            variant="outline"
            hlmDialogClose
            [disabled]="loading()"
          >
            Cancel
          </button>
          <button
            type="button"
            hlmBtn
            [disabled]="loading() || !sourcePath().trim()"
            (click)="onSubmit()"
          >
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
export class PackImportDialog {
  /** Two-way open state for programmatic show/hide. */
  readonly open = model(false);

  /** Parent-driven loading while import API call is in flight. */
  readonly loading = input(false);

  /** Parent-driven error message (cleared by parent on open/success). */
  readonly error = input<string | null>(null);

  readonly importRequested = output<string>();
  readonly cancelled = output<void>();

  protected readonly sourcePath = signal('');

  protected readonly dialogState = computed<BrnDialogState>(() =>
    this.open() ? 'open' : 'closed',
  );

  protected onStateChanged(state: BrnDialogState): void {
    this.open.set(state === 'open');
    if (state === 'open') {
      this.sourcePath.set('');
    }
  }

  protected onPathInput(event: Event): void {
    this.sourcePath.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(): void {
    const path = this.sourcePath().trim();
    if (!path || this.loading()) {
      return;
    }
    this.importRequested.emit(path);
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
