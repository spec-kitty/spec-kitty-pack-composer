import { ChangeDetectionStrategy, Component, model, output } from '@angular/core';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';

/**
 * Overview sidebar filter criteria for the Charters list (FR-004).
 *
 * `getSummaries()` returns the full charter list with no server-side filter params, so
 * every field here is applied entirely client-side by the overview page — unlike Packs'
 * `PackListFilters`, which maps to PocketBase query filters.
 */
export interface CharterListFilters {
  name: string;
  activeStatus: 'all' | 'active-only' | 'inactive-only';
  hasConflictsOnly: boolean;
  createdAtFrom: string;
  createdAtTo: string;
  updatedAtFrom: string;
  updatedAtTo: string;
}

/** Local form state for overview sidebar filters (dates as YYYY-MM-DD, same shape as the emitted filters). */
export type CharterFilterFormState = CharterListFilters;

export function emptyCharterFilterForm(): CharterFilterFormState {
  return {
    name: '',
    activeStatus: 'all',
    hasConflictsOnly: false,
    createdAtFrom: '',
    createdAtTo: '',
    updatedAtFrom: '',
    updatedAtTo: '',
  };
}

@Component({
  selector: 'app-charter-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmCheckboxImports,
    HlmFieldImports,
    HlmInputImports,
    HlmLabelImports,
    HlmNativeSelectImports,
  ],
  host: {
    class: 'block h-full',
  },
  template: `
    <aside
      class="border-border bg-muted/20 flex h-full flex-col gap-4 rounded-xl border p-4"
      aria-label="Charter filters"
    >
      <div>
        <h2 class="text-foreground text-sm font-semibold tracking-tight">Filters</h2>
        <p class="text-muted-foreground mt-1 text-xs">
          Search by name and narrow by status, conflicts, or dates.
        </p>
      </div>

      <hlm-field-group class="gap-4">
        <hlm-field>
          <label hlmFieldLabel for="charter-filter-name">Name</label>
          <input
            hlmInput
            id="charter-filter-name"
            type="search"
            name="charter-name"
            autocomplete="off"
            placeholder="Search charters…"
            [value]="form().name"
            (input)="onNameInput($event)"
          />
        </hlm-field>

        <hlm-field>
          <label hlmFieldLabel for="charter-filter-active-status">Status</label>
          <hlm-native-select
            selectId="charter-filter-active-status"
            class="w-full"
            [value]="form().activeStatus"
            (valueChange)="onActiveStatusChange($event)"
          >
            <option hlmNativeSelectOption value="all">All charters</option>
            <option hlmNativeSelectOption value="active-only">Active only</option>
            <option hlmNativeSelectOption value="inactive-only">Inactive only</option>
          </hlm-native-select>
        </hlm-field>

        <hlm-field orientation="horizontal" class="items-center gap-2">
          <hlm-checkbox
            inputId="charter-filter-has-conflicts"
            [checked]="form().hasConflictsOnly"
            (checkedChange)="onHasConflictsOnlyChange($event)"
          />
          <label hlmFieldLabel for="charter-filter-has-conflicts" class="text-sm font-normal">
            Has conflicts only
          </label>
        </hlm-field>

        <fieldset class="space-y-2">
          <legend class="text-foreground text-sm font-medium">Created</legend>
          <hlm-field>
            <label hlmLabel for="charter-filter-created-from" class="text-muted-foreground text-xs"
              >From</label
            >
            <input
              hlmInput
              id="charter-filter-created-from"
              type="date"
              [value]="form().createdAtFrom"
              (input)="patch({ createdAtFrom: inputValue($event) })"
            />
          </hlm-field>
          <hlm-field>
            <label hlmLabel for="charter-filter-created-to" class="text-muted-foreground text-xs"
              >To</label
            >
            <input
              hlmInput
              id="charter-filter-created-to"
              type="date"
              [value]="form().createdAtTo"
              (input)="patch({ createdAtTo: inputValue($event) })"
            />
          </hlm-field>
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="text-foreground text-sm font-medium">Last updated</legend>
          <hlm-field>
            <label hlmLabel for="charter-filter-updated-from" class="text-muted-foreground text-xs"
              >From</label
            >
            <input
              hlmInput
              id="charter-filter-updated-from"
              type="date"
              [value]="form().updatedAtFrom"
              (input)="patch({ updatedAtFrom: inputValue($event) })"
            />
          </hlm-field>
          <hlm-field>
            <label hlmLabel for="charter-filter-updated-to" class="text-muted-foreground text-xs"
              >To</label
            >
            <input
              hlmInput
              id="charter-filter-updated-to"
              type="date"
              [value]="form().updatedAtTo"
              (input)="patch({ updatedAtTo: inputValue($event) })"
            />
          </hlm-field>
        </fieldset>
      </hlm-field-group>
    </aside>
  `,
})
export class CharterFilters {
  /** Two-way filter form state. */
  readonly form = model<CharterFilterFormState>(emptyCharterFilterForm());

  /** Emitted whenever filters change (after form model update), debounced by the page (FR-004). */
  readonly filtersChange = output<CharterListFilters>();

  protected onNameInput(event: Event): void {
    this.patch({ name: this.inputValue(event) });
  }

  protected onActiveStatusChange(value: string | null | undefined): void {
    const activeStatus =
      value === 'active-only' || value === 'inactive-only' ? value : 'all';
    this.patch({ activeStatus });
  }

  protected onHasConflictsOnlyChange(checked: boolean): void {
    this.patch({ hasConflictsOnly: checked });
  }

  protected patch(partial: Partial<CharterFilterFormState>): void {
    const next = { ...this.form(), ...partial };
    this.form.set(next);
    this.filtersChange.emit(next);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
