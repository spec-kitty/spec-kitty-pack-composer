import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import type { CharterSummary } from '../models';
import { CharterTable } from './charter-table';
import { makeCharterSummary } from './charter-test-fixtures';

const CHARTERS: CharterSummary[] = [
  makeCharterSummary(),
  makeCharterSummary({
    id: 'charter-2',
    name: 'Active Charter',
    active: true,
    enabled_item_count: 4,
    has_conflicts: true,
    created: '2026-03-01T08:00:00.000Z',
    updated: '2026-03-05T08:00:00.000Z',
  }),
];

async function renderTable(
  charters: CharterSummary[] = CHARTERS,
  inputs: {
    activatingCharterId?: string | null;
    exportingCharterId?: string | null;
    removingCharterId?: string | null;
  } = {},
) {
  const fixture = TestBed.createComponent(CharterTable);
  fixture.componentRef.setInput('charters', charters);
  if ('activatingCharterId' in inputs) {
    fixture.componentRef.setInput('activatingCharterId', inputs.activatingCharterId ?? null);
  }
  if ('exportingCharterId' in inputs) {
    fixture.componentRef.setInput('exportingCharterId', inputs.exportingCharterId ?? null);
  }
  if ('removingCharterId' in inputs) {
    fixture.componentRef.setInput('removingCharterId', inputs.removingCharterId ?? null);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

/** Opens the "..." actions menu for a row and returns its portaled menu items (rendered on `document.body`). */
async function openRowActions(
  fixture: ReturnType<typeof TestBed.createComponent>,
  charterName: string,
): Promise<HTMLElement[]> {
  const el = fixture.nativeElement as HTMLElement;
  const trigger = el.querySelector<HTMLButtonElement>(
    `button[aria-label="Actions for ${charterName}"]`,
  );
  expect(trigger).toBeTruthy();
  trigger!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  return Array.from(
    document.body.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]'),
  );
}

function findMenuItem(items: HTMLElement[], text: string): HTMLElement | undefined {
  return items.find((item) => item.textContent?.trim().includes(text));
}

describe('CharterTable', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharterTable],
      providers: [provideRouter([]), provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('lists name, active, enabled items, conflicts, created, updated, and actions columns (FR-003)', async () => {
    const fixture = await renderTable();
    const el = fixture.nativeElement as HTMLElement;

    const headers = Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      'Name',
      'Active',
      'Enabled items',
      'Conflicts',
      'Created',
      'Updated',
      'Actions',
    ]);

    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);

    const firstRowCells = Array.from(rows[0].querySelectorAll('td')).map((td) =>
      td.textContent?.trim(),
    );
    expect(firstRowCells[0]).toBe('Doctrine Charter');
    expect(firstRowCells[1]).toBe('Inactive');
    expect(firstRowCells[2]).toBe('0');
    expect(firstRowCells[3]).toBe('None');
    expect(firstRowCells[4]).toBe('Jan 15, 2026');
    expect(firstRowCells[5]).toBe('Feb 20, 2026');
  });

  it('links each row name to the charter detail route (FR-003)', async () => {
    const fixture = await renderTable();
    const nameLink = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'tbody tr:first-child td:first-child a',
    );

    expect(nameLink?.getAttribute('href')).toBe('/charters/charter-1');
    expect(nameLink?.textContent?.trim()).toBe('Doctrine Charter');
  });

  it('shows a non-color conflict indicator (icon + text) when a charter has conflicts (NFR-003)', async () => {
    const fixture = await renderTable();
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    const conflictButton = rows[1].querySelector<HTMLButtonElement>(
      'td:nth-child(4) button[aria-label*="conflicts"]',
    );
    expect(conflictButton).toBeTruthy();
    expect(conflictButton!.textContent).toContain('Conflicts');
    expect(conflictButton!.querySelector('ng-icon')).toBeTruthy();

    expect(rows[0].querySelector('td:nth-child(4) button')).toBeNull();
  });

  it('disables the Activate menu item for the already-active row (FR-003)', async () => {
    const fixture = await renderTable();

    const activeItems = await openRowActions(fixture, 'Active Charter');
    const activateItem = findMenuItem(activeItems, 'Activate');
    expect(activateItem).toBeTruthy();
    expect(activateItem!.hasAttribute('data-disabled')).toBe(true);
  });

  it('keeps the Activate menu item enabled for an inactive row (FR-003)', async () => {
    const fixture = await renderTable();

    const inactiveItems = await openRowActions(fixture, 'Doctrine Charter');
    const activateItem = findMenuItem(inactiveItems, 'Activate');
    expect(activateItem).toBeTruthy();
    expect(activateItem!.hasAttribute('data-disabled')).toBe(false);
  });

  it('emits activate, rename, delete, and export requests from the row actions menu', async () => {
    const fixture = await renderTable();
    const activated: CharterSummary[] = [];
    const renamed: CharterSummary[] = [];
    const deleted: CharterSummary[] = [];
    const exported: CharterSummary[] = [];
    fixture.componentInstance.activateCharter.subscribe((charter) => activated.push(charter));
    fixture.componentInstance.renameCharter.subscribe((charter) => renamed.push(charter));
    fixture.componentInstance.deleteCharter.subscribe((charter) => deleted.push(charter));
    fixture.componentInstance.exportCharter.subscribe((charter) => exported.push(charter));

    const firstRowItems = await openRowActions(fixture, 'Doctrine Charter');
    findMenuItem(firstRowItems, 'Rename')!.click();
    fixture.detectChanges();

    const firstRowItemsAgain = await openRowActions(fixture, 'Doctrine Charter');
    findMenuItem(firstRowItemsAgain, 'Activate')!.click();
    fixture.detectChanges();

    const firstRowItemsExport = await openRowActions(fixture, 'Doctrine Charter');
    findMenuItem(firstRowItemsExport, 'Export')!.click();
    fixture.detectChanges();

    const secondRowItems = await openRowActions(fixture, 'Active Charter');
    findMenuItem(secondRowItems, 'Delete')!.click();
    fixture.detectChanges();

    expect(renamed.map((charter) => charter.id)).toEqual(['charter-1']);
    expect(activated.map((charter) => charter.id)).toEqual(['charter-1']);
    expect(exported.map((charter) => charter.id)).toEqual(['charter-1']);
    expect(deleted.map((charter) => charter.id)).toEqual(['charter-2']);
  });

  it('shows a spinner instead of the actions menu while an activate is in flight (FR-024)', async () => {
    const fixture = await renderTable(CHARTERS, { activatingCharterId: 'charter-1' });
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    expect(
      rows[0].querySelector('app-loading-indicator[aria-label="Activating charter"]'),
    ).toBeTruthy();
    expect(rows[0].querySelector('button[aria-label="Actions for Doctrine Charter"]')).toBeNull();
    expect(rows[1].querySelector('button[aria-label="Actions for Active Charter"]')).toBeTruthy();
  });

  it('shows a spinner instead of the actions menu while an export is in flight (FR-024)', async () => {
    const fixture = await renderTable(CHARTERS, { exportingCharterId: 'charter-1' });
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    expect(
      rows[0].querySelector('app-loading-indicator[aria-label="Exporting charter"]'),
    ).toBeTruthy();
    expect(rows[0].querySelector('button[aria-label="Actions for Doctrine Charter"]')).toBeNull();
  });

  it('shows a spinner instead of the actions menu while a delete is in flight (FR-024)', async () => {
    const fixture = await renderTable(CHARTERS, { removingCharterId: 'charter-2' });
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    expect(
      rows[1].querySelector('app-loading-indicator[aria-label="Deleting charter"]'),
    ).toBeTruthy();
    expect(rows[1].querySelector('button[aria-label="Actions for Active Charter"]')).toBeNull();
  });

  it('truncates a long charter name and exposes the full name via a title attribute', async () => {
    const longName = 'A'.repeat(120);
    const fixture = await renderTable([makeCharterSummary({ name: longName })]);
    const el = fixture.nativeElement as HTMLElement;

    const nameCell = el.querySelector<HTMLElement>('tbody tr:first-child td:first-child');
    expect(nameCell?.getAttribute('title')).toBe(longName);
    expect(nameCell?.querySelector('a')?.classList.contains('truncate')).toBe(true);
  });

  it('renders no rows for an empty charter list (FR-003)', async () => {
    const fixture = await renderTable([]);

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).toHaveLength(0);
  });
});
