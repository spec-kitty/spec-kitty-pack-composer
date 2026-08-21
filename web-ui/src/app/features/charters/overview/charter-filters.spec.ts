import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import {
  CharterFilters,
  emptyCharterFilterForm,
  type CharterListFilters,
} from './charter-filters';

describe('emptyCharterFilterForm', () => {
  it('starts with every field empty/default (FR-004)', () => {
    expect(emptyCharterFilterForm()).toEqual({
      name: '',
      activeStatus: 'all',
      hasConflictsOnly: false,
      createdAtFrom: '',
      createdAtTo: '',
      updatedAtFrom: '',
      updatedAtTo: '',
    });
  });
});

describe('CharterFilters', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharterFilters],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders name search, status select, conflicts toggle, and date range inputs (FR-004)', () => {
    const fixture = TestBed.createComponent(CharterFilters);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const search = el.querySelector<HTMLInputElement>('#charter-filter-name');
    expect(search?.type).toBe('search');

    expect(el.querySelector('#charter-filter-active-status')).toBeTruthy();
    expect(el.querySelector('#charter-filter-has-conflicts')).toBeTruthy();

    for (const id of [
      '#charter-filter-created-from',
      '#charter-filter-created-to',
      '#charter-filter-updated-from',
      '#charter-filter-updated-to',
    ]) {
      expect(el.querySelector<HTMLInputElement>(id)?.type).toBe('date');
    }

    const legends = Array.from(el.querySelectorAll('legend')).map((node) =>
      node.textContent?.trim(),
    );
    expect(legends).toEqual(['Created', 'Last updated']);
  });

  it('offers all/active-only/inactive-only status options (FR-004)', () => {
    const fixture = TestBed.createComponent(CharterFilters);
    fixture.detectChanges();

    const values = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLOptionElement>('option'),
    ).map((option) => option.value);

    expect(values).toEqual(['all', 'active-only', 'inactive-only']);
  });

  it('emits the full filter state when the name search changes (FR-004)', () => {
    const fixture = TestBed.createComponent(CharterFilters);
    const emitted: CharterListFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((filters) => emitted.push(filters));
    fixture.detectChanges();

    const search = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#charter-filter-name',
    )!;
    search.value = 'doctrine';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(emitted).toEqual([{ ...emptyCharterFilterForm(), name: 'doctrine' }]);
    expect(fixture.componentInstance.form().name).toBe('doctrine');
  });

  it('emits the full filter state when the has-conflicts checkbox toggles (FR-004)', () => {
    const fixture = TestBed.createComponent(CharterFilters);
    const emitted: CharterListFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((filters) => emitted.push(filters));
    fixture.detectChanges();

    const checkbox = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '#charter-filter-has-conflicts',
    )!;
    checkbox.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.form().hasConflictsOnly).toBe(true);
    expect(emitted).toEqual([{ ...emptyCharterFilterForm(), hasConflictsOnly: true }]);
  });

  it('emits the full filter state when a created-date bound changes (FR-004)', () => {
    const fixture = TestBed.createComponent(CharterFilters);
    const emitted: CharterListFilters[] = [];
    fixture.componentInstance.filtersChange.subscribe((filters) => emitted.push(filters));
    fixture.detectChanges();

    const from = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '#charter-filter-created-from',
    )!;
    from.value = '2026-03-04';
    from.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(emitted).toEqual([{ ...emptyCharterFilterForm(), createdAtFrom: '2026-03-04' }]);
  });

  it('returns to the empty/default state after reset (FR-004)', () => {
    const fixture = TestBed.createComponent(CharterFilters);
    fixture.detectChanges();

    fixture.componentInstance.form.set({
      name: 'doctrine',
      activeStatus: 'active-only',
      hasConflictsOnly: true,
      createdAtFrom: '2026-01-01',
      createdAtTo: '2026-01-31',
      updatedAtFrom: '2026-02-01',
      updatedAtTo: '2026-02-28',
    });
    fixture.detectChanges();

    fixture.componentInstance.form.set(emptyCharterFilterForm());
    fixture.detectChanges();

    expect(fixture.componentInstance.form()).toEqual(emptyCharterFilterForm());
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        '#charter-filter-name',
      )?.value,
    ).toBe('');
  });
});
