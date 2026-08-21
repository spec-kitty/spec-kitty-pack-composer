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
  selector: 'app-charter-create-dialog',
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
          <h2 hlmDialogTitle>Create charter</h2>
          <p hlmDialogDescription>Give the new charter a name.</p>
        </hlm-dialog-header>

        <hlm-field>
          <label hlmFieldLabel for="charter-create-name">Name</label>
          <input
            hlmInput
            id="charter-create-name"
            type="text"
            name="charter-name"
            autocomplete="off"
            placeholder="My charter"
            [disabled]="loading()"
            [value]="name()"
            (input)="onNameInput($event)"
            (keydown.enter)="onSubmit()"
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
              <app-loading-indicator label="Creating" [showLabel]="true" />
            } @else {
              Create
            }
          </button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class CharterCreateDialog {
  /** Two-way open state for programmatic show/hide. */
  readonly open = model(false);

  /** Parent-driven loading while the create API call is in flight. */
  readonly loading = input(false);

  /** Parent-driven error message (cleared by parent on open/success). */
  readonly error = input<string | null>(null);

  readonly created = output<string>();
  readonly cancelled = output<void>();

  protected readonly name = signal('');

  protected readonly dialogState = computed<BrnDialogState>(() =>
    this.open() ? 'open' : 'closed',
  );

  protected onStateChanged(state: BrnDialogState): void {
    this.open.set(state === 'open');
    if (state === 'open') {
      this.name.set('');
    }
  }

  protected onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onSubmit(): void {
    const name = this.name().trim();
    if (!name || this.loading()) {
      return;
    }
    this.created.emit(name);
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
