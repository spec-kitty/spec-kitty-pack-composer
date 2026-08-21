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
import { HlmInputImports } from '@spartan-ng/helm/input';

import { LoadingIndicator } from '../../../shared';
import type { CharterSummary } from '../models';

@Component({
  selector: 'app-charter-rename-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDialogImports, HlmButtonImports, HlmFieldImports, HlmInputImports, LoadingIndicator],
  template: `
    <hlm-dialog
      [state]="dialogState()"
      [disableClose]="loading()"
      (stateChanged)="onStateChanged($event)"
      (closed)="onDismissed()"
    >
      <hlm-dialog-content *hlmDialogPortal="let ctx" class="sm:max-w-md" [showCloseButton]="!loading()">
        <hlm-dialog-header>
          <h2 hlmDialogTitle>Rename charter</h2>
          <p hlmDialogDescription>Choose a new name for “{{ charter()?.name }}”.</p>
        </hlm-dialog-header>

        <hlm-field>
          <label hlmFieldLabel for="charter-rename-name">Name</label>
          <input
            hlmInput
            id="charter-rename-name"
            type="text"
            name="charter-name"
            autocomplete="off"
            [disabled]="loading()"
            [value]="name()"
            (input)="onNameInput($event)"
          />
          @if (error()) {
            <hlm-field-error forceShow>{{ error() }}</hlm-field-error>
          }
        </hlm-field>

        <hlm-dialog-footer>
          <button type="button" hlmBtn variant="outline" hlmDialogClose [disabled]="loading()">
            Cancel
          </button>
          <button type="button" hlmBtn [disabled]="loading() || !name().trim()" (click)="onSubmit()">
            @if (loading()) {
              <app-loading-indicator label="Renaming" [showLabel]="true" />
            } @else {
              Rename
            }
          </button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class CharterRenameDialog {
  /** Two-way open state for programmatic show/hide. */
  readonly open = model(false);

  /** Charter being renamed; drives the pre-filled name field. */
  readonly charter = input.required<CharterSummary | null>();

  /** Parent-driven loading while the rename API call is in flight. */
  readonly loading = input(false);

  /** Parent-driven error message (cleared by parent on open/success). */
  readonly error = input<string | null>(null);

  readonly renamed = output<string>();
  readonly cancelled = output<void>();

  protected readonly name = signal('');

  protected readonly dialogState = computed<BrnDialogState>(() =>
    this.open() ? 'open' : 'closed',
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        this.name.set(this.charter()?.name ?? '');
      }
    });
  }

  protected onStateChanged(state: BrnDialogState): void {
    this.open.set(state === 'open');
  }

  protected onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(): void {
    const name = this.name().trim();
    if (!name || this.loading()) {
      return;
    }
    this.renamed.emit(name);
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
