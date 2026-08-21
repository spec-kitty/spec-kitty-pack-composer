import { ChangeDetectionStrategy, Component, model, output } from '@angular/core';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';

import type { PackListFilters, PackOrigin } from '../models';

/** Local form state for overview sidebar filters (dates as YYYY-MM-DD). */
export interface PackFilterFormState {
  name: string;
  origin: '' | PackOrigin;
  importedAtFrom: string;
  importedAtTo: string;
  updatedAtFrom: string;
  updatedAtTo: string;
  /** Client-side-only toggle (FR-014); never sent to PocketBase via toPackListFilters. */
  missingParentOnly: boolean;
}

export function emptyPackFilterForm(): PackFilterFormState {
  return {
    name: '',
    origin: '',
    importedAtFrom: '',
    importedAtTo: '',
    updatedAtFrom: '',
    updatedAtTo: '',
    missingParentOnly: false,
  };
}

/** Map sidebar form values to PacksReadService filter DTO. */
export function toPackListFilters(form: PackFilterFormState): PackListFilters {
  const filters: PackListFilters = {};
  const name = form.name.trim();
  if (name) {
    filters.name = name;
  }
  if (form.origin === 'local' || form.origin === 'remote' || form.origin === 'built-in') {
    filters.origin = form.origin;
  }
  if (form.importedAtFrom) {
    filters.importedAtFrom = `${form.importedAtFrom}T00:00:00.000Z`;
  }
  if (form.importedAtTo) {
    filters.importedAtTo = `${form.importedAtTo}T23:59:59.999Z`;
  }
  if (form.updatedAtFrom) {
    filters.updatedAtFrom = `${form.updatedAtFrom}T00:00:00.000Z`;
  }
  if (form.updatedAtTo) {
    filters.updatedAtTo = `${form.updatedAtTo}T23:59:59.999Z`;
  }
  return filters;
}

@Component({
  selector: 'app-pack-filters',
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
      aria-label="Pack filters"
    >
      <div>
        <h2 class="text-foreground text-sm font-semibold tracking-tight">Filters</h2>
        <p class="text-muted-foreground mt-1 text-xs">
          Search by name and narrow by origin or dates.
        </p>
      </div>

      <hlm-field-group class="gap-4">
        <hlm-field>
          <label hlmFieldLabel for="pack-filter-name">Name</label>
          <input
            hlmInput
            id="pack-filter-name"
            type="search"
            name="pack-name"
            autocomplete="off"
            placeholder="Search packs…"
            [value]="form().name"
            (input)="onNameInput($event)"
          />
        </hlm-field>

        <hlm-field>
          <label hlmFieldLabel for="pack-filter-origin">Origin</label>
          <hlm-native-select
            selectId="pack-filter-origin"
            class="w-full"
            [value]="form().origin"
            (valueChange)="onOriginChange($event)"
          >
            <option hlmNativeSelectOption value="">All origins</option>
            <option hlmNativeSelectOption value="local">Local</option>
            <!-- FR-010: remote must remain selectable even when empty -->
            <option hlmNativeSelectOption value="remote">Remote</option>
            <option hlmNativeSelectOption value="built-in">Built-in</option>
          </hlm-native-select>
        </hlm-field>

        <fieldset class="space-y-2">
          <legend class="text-foreground text-sm font-medium">Import date</legend>
          <hlm-field>
            <label hlmLabel for="pack-filter-imported-from" class="text-muted-foreground text-xs"
              >From</label
            >
            <input
              hlmInput
              id="pack-filter-imported-from"
              type="date"
              [value]="form().importedAtFrom"
              (input)="patch({ importedAtFrom: inputValue($event) })"
            />
          </hlm-field>
          <hlm-field>
            <label hlmLabel for="pack-filter-imported-to" class="text-muted-foreground text-xs"
              >To</label
            >
            <input
              hlmInput
              id="pack-filter-imported-to"
              type="date"
              [value]="form().importedAtTo"
              (input)="patch({ importedAtTo: inputValue($event) })"
            />
          </hlm-field>
        </fieldset>

        <fieldset class="space-y-2">
          <legend class="text-foreground text-sm font-medium">Last updated</legend>
          <hlm-field>
            <label hlmLabel for="pack-filter-updated-from" class="text-muted-foreground text-xs"
              >From</label
            >
            <input
              hlmInput
              id="pack-filter-updated-from"
              type="date"
              [value]="form().updatedAtFrom"
              (input)="patch({ updatedAtFrom: inputValue($event) })"
            />
          </hlm-field>
          <hlm-field>
            <label hlmLabel for="pack-filter-updated-to" class="text-muted-foreground text-xs"
              >To</label
            >
            <input
              hlmInput
              id="pack-filter-updated-to"
              type="date"
              [value]="form().updatedAtTo"
              (input)="patch({ updatedAtTo: inputValue($event) })"
            />
          </hlm-field>
        </fieldset>

        <hlm-field orientation="horizontal" class="items-center gap-2">
          <hlm-checkbox
            inputId="pack-filter-missing-parent"
            [checked]="form().missingParentOnly"
            (checkedChange)="onMissingParentOnlyChange($event)"
          />
          <label hlmFieldLabel for="pack-filter-missing-parent" class="text-sm font-normal">
            Missing parent only
          </label>
        </hlm-field>
      </hlm-field-group>
    </aside>
  `,
})
export class PackFilters {
  /** Two-way filter form state. */
  readonly form = model<PackFilterFormState>(emptyPackFilterForm());

  /** Emitted whenever filters change (after form model update). */
  readonly filtersChange = output<PackListFilters>();

  protected onNameInput(event: Event): void {
    this.patch({ name: this.inputValue(event) });
  }

  protected onOriginChange(value: string | null | undefined): void {
    const origin =
      value === 'local' || value === 'remote' || value === 'built-in'
        ? value
        : ('' as PackFilterFormState['origin']);
    this.patch({ origin });
  }

  /**
   * Client-side-only toggle (FR-014) — updates the two-way-bound form model directly,
   * without emitting `filtersChange`, so it never enters the debounced server-refetch pipeline.
   */
  protected onMissingParentOnlyChange(checked: boolean): void {
    this.form.set({ ...this.form(), missingParentOnly: checked });
  }

  protected patch(partial: Partial<PackFilterFormState>): void {
    const next = { ...this.form(), ...partial };
    this.form.set(next);
    this.filtersChange.emit(toPackListFilters(next));
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
