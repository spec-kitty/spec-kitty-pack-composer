import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import type { PackListFilters } from '../models';
import {
  PackFilters,
  emptyPackFilterForm,
  toPackListFilters,
  type PackFilterFormState,
} from './pack-filters';

function form(overrides: Partial<PackFilterFormState> = {}): PackFilterFormState {
  return { ...emptyPackFilterForm(), ...overrides };
}

describe('toPackListFilters', () => {
  it('omits every empty field so an untouched sidebar lists all packs (FR-009)', () => {
    expect(toPackListFilters(emptyPackFilterForm())).toEqual({});
  });

  it('passes a trimmed name through for search (FR-009)', () => {
    expect(toPackListFilters(form({ name: '  doctrine  ' }))).toEqual({ name: 'doctrine' });
    expect(toPackListFilters(form({ name: '   ' }))).toEqual({});
  });

  it('supports local, remote, and built-in origin values (FR-010)', () => {
    expect(toPackListFilters(form({ origin: 'local' }))).toEqual({ origin: 'local' });
    expect(toPackListFilters(form({ origin: 'remote' }))).toEqual({ origin: 'remote' });
    expect(toPackListFilters(form({ origin: 'built-in' }))).toEqual({ origin: 'built-in' });
    expect(toPackListFilters(form({ origin: '' }))).toEqual({});
  });

  it('maps import and last-updated dates to inclusive ISO bounds (FR-009)', () => {
    expect(
      toPackListFilters(
        form({
          importedAtFrom: '2026-01-01',
          importedAtTo: '2026-01-31',
          updatedAtFrom: '2026-02-01',
          updatedAtTo: '2026-02-28',
        }),
      ),
    ).toEqual({
      importedAtFrom: '2026-01-01T00:00:00.000Z',
      importedAtTo: '2026-01-31T23:59:59.999Z',
      updatedAtFrom: '2026-02-01T00:00:00.000Z',
      updatedAtTo: '2026-02-28T23:59:59.999Z',
    });
  });

  it('exposes import date instead of a creation-date filter (C-004)', () => {
    const keys = Object.keys(emptyPackFilterForm());

    expect(keys).toEqual([
      'name',
      'origin',
      'importedAtFrom',
      'importedAtTo',
      'updatedAtFrom',
      'updatedAtTo',
      'missingParentOnly',
    ]);
    expect(keys.some((key) => /creat/i.test(key))).toBe(false);
  });

  it('never sends the client-side missingParentOnly toggle to PocketBase (FR-014)', () => {
    expect(toPackListFilters(form({ missingParentOnly: true }))).toEqual({});
    expect(toPackListFilters(form({ name: 'core', missingParentOnly: true }))).toEqual({
      name: 'core',
    });
  });
});

describe('PackFilters', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackFilters],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders name search plus import and last-updated date inputs (FR-009)', () => {
    const fixture = TestBed.createComponent(PackFilters);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const search = el.querySelector<HTMLInputElement>('#pack-filter-name');
    expect(search?.type).toBe('search');

    for (const id of [
      '#pack-filter-imported-from',
      '#pack-filter-imported-to',
      '#pack-filter-updated-from',
      '#pack-filter-updated-to',
    ]) {
      expect(el.querySelector<HTMLInputElement>(id)?.type).toBe('date');
    }

    const legends = Array.from(el.querySelectorAll('legend')).map((node) =>
      node.textContent?.trim(),
    );
    expect(legends).toEqual(['Import date', 'Last updated']);
    expect(el.textContent).not.toMatch(/creation date/i);
  });

  it('offers remote and built-in origin options even when no such packs exist (FR-010)', () => {
    const fixture = TestBed.createComponent(PackFilters);
    fixture.detectChanges();

    const values = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>('option'),
    ).map((option) => option.value);

    expect(values).toEqual(['', 'local', 'remote', 'built-in']);
  });

  it('emits mapped filters when the name search changes (FR-009)', () => {
    const fixture = TestBed.createComponent(PackFilters);
    const emitted: PackListFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((filters) => emitted.push(filters));
    fixture.detectChanges();

    const search = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#pack-filter-name',
    )!;
    search.value = 'spec kitty';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(emitted).toEqual([{ name: 'spec kitty' }]);
    expect(fixture.componentInstance.form().name).toBe('spec kitty');
  });

  it('emits mapped filters when an import date bound changes (FR-009)', () => {
    const fixture = TestBed.createComponent(PackFilters);
    const emitted: PackListFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((filters) => emitted.push(filters));
    fixture.detectChanges();

    const from = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#pack-filter-imported-from',
    )!;
    from.value = '2026-03-04';
    from.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(emitted).toEqual([{ importedAtFrom: '2026-03-04T00:00:00.000Z' }]);
  });

  it('toggles form().missingParentOnly without emitting filtersChange (FR-014)', () => {
    const fixture = TestBed.createComponent(PackFilters);
    const emitted: PackListFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((filters) => emitted.push(filters));
    fixture.detectChanges();

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '#pack-filter-missing-parent',
    )!;
    expect(checkbox).toBeTruthy();
    checkbox.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.form().missingParentOnly).toBe(true);
    expect(emitted).toEqual([]);
  });
});
