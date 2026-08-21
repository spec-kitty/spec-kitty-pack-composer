import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import type { Pack, ParentStatusMap } from '../models';
import { PackTable } from './pack-table';
import { makePack } from './pack-test-fixtures';

const PACKS: Pack[] = [
  makePack(),
  makePack({
    id: 'pack-2',
    name: 'Remote Doctrine',
    origin: 'remote',
    version: '',
    imported_at: '2026-03-01T08:00:00.000Z',
    updated_at: '2026-03-05T08:00:00.000Z',
  }),
];

async function renderTable(
  packs: Pack[] = PACKS,
  inputs: {
    exportingPackId?: string | null;
    removingPackId?: string | null;
    refreshingPackId?: string | null;
    parentStatus?: ParentStatusMap;
  } = {},
) {
  const fixture = TestBed.createComponent(PackTable);
  fixture.componentRef.setInput('packs', packs);
  fixture.componentRef.setInput('parentStatus', inputs.parentStatus ?? {});
  if ('exportingPackId' in inputs) {
    fixture.componentRef.setInput('exportingPackId', inputs.exportingPackId ?? null);
  }
  if ('removingPackId' in inputs) {
    fixture.componentRef.setInput('removingPackId', inputs.removingPackId ?? null);
  }
  if ('refreshingPackId' in inputs) {
    fixture.componentRef.setInput('refreshingPackId', inputs.refreshingPackId ?? null);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

/** Opens the "..." actions menu for a row and returns its portaled menu items (rendered on `document.body`). */
async function openRowActions(
  fixture: ReturnType<typeof TestBed.createComponent>,
  packName: string,
): Promise<HTMLElement[]> {
  const el = fixture.nativeElement as HTMLElement;
  const trigger = el.querySelector<HTMLButtonElement>(`button[aria-label="Actions for ${packName}"]`);
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

describe('PackTable', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackTable],
      providers: [provideRouter([]), provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('lists name, origin, version, import date and last updated columns (FR-008)', async () => {
    const fixture = await renderTable();
    const el = fixture.nativeElement as HTMLElement;

    const headers = Array.from(el.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      'Name',
      'Origin',
      'Version',
      'Import date',
      'Last updated',
      'Actions',
    ]);

    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);

    const firstRowCells = Array.from(rows[0].querySelectorAll('td')).map((td) =>
      td.textContent?.trim(),
    );
    expect(firstRowCells[0]).toBe('Doctrine Core');
    expect(firstRowCells[1]).toBe('local');
    expect(firstRowCells[2]).toBe('1.2.3');
    expect(firstRowCells[3]).toBe('Jan 15, 2026');
    expect(firstRowCells[4]).toBe('Feb 20, 2026');

    const secondRowCells = Array.from(rows[1].querySelectorAll('td')).map((td) =>
      td.textContent?.trim(),
    );
    expect(secondRowCells[1]).toBe('remote');
    expect(secondRowCells[2]).toBe('—');
  });

  it('links each row name to the pack detail route (FR-008)', async () => {
    const fixture = await renderTable();
    const nameLink = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'tbody tr:first-child td:first-child a',
    );

    expect(nameLink?.getAttribute('href')).toBe('/packs/pack-1');
    expect(nameLink?.textContent?.trim()).toBe('Doctrine Core');
  });

  it('links the "Open" action in the actions menu to the pack detail route (FR-008)', async () => {
    const fixture = await renderTable();
    const items = await openRowActions(fixture, 'Doctrine Core');
    const openLink = findMenuItem(items, 'Open') as HTMLAnchorElement | undefined;

    expect(openLink?.getAttribute('href')).toBe('/packs/pack-1');
  });

  it('collapses row actions behind a single "..." menu button (FR-008)', async () => {
    const fixture = await renderTable();
    const el = fixture.nativeElement as HTMLElement;
    const firstRow = el.querySelectorAll('tbody tr')[0];

    // No standalone Open/Export/Remove buttons in the row itself — just the trigger.
    expect(firstRow.querySelectorAll('td:last-child button, td:last-child a')).toHaveLength(1);
    expect(
      firstRow.querySelector('button[aria-label="Actions for Doctrine Core"]'),
    ).toBeTruthy();
  });

  it('emits refresh, export and remove requests from the row actions menu (FR-012/FR-013)', async () => {
    const fixture = await renderTable();
    const refreshed: Pack[] = [];
    const exported: Pack[] = [];
    const removed: Pack[] = [];
    fixture.componentInstance.refreshPack.subscribe((pack) => refreshed.push(pack));
    fixture.componentInstance.exportPack.subscribe((pack) => exported.push(pack));
    fixture.componentInstance.removePack.subscribe((pack) => removed.push(pack));

    const firstRowItems = await openRowActions(fixture, 'Doctrine Core');
    findMenuItem(firstRowItems, 'Refresh')!.click();
    fixture.detectChanges();

    const firstRowItemsAgain = await openRowActions(fixture, 'Doctrine Core');
    findMenuItem(firstRowItemsAgain, 'Export')!.click();
    fixture.detectChanges();

    const secondRowItems = await openRowActions(fixture, 'Remote Doctrine');
    findMenuItem(secondRowItems, 'Remove')!.click();
    fixture.detectChanges();

    expect(refreshed.map((pack) => pack.id)).toEqual(['pack-1']);
    expect(exported.map((pack) => pack.id)).toEqual(['pack-1']);
    expect(removed.map((pack) => pack.id)).toEqual(['pack-2']);
  });

  it('shows a spinner instead of the actions menu while an export is in flight (FR-024)', async () => {
    const fixture = await renderTable(PACKS, { exportingPackId: 'pack-1' });
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    expect(
      rows[0].querySelector('app-loading-indicator[aria-label="Exporting pack"]'),
    ).toBeTruthy();
    expect(rows[0].querySelector('button[aria-label="Actions for Doctrine Core"]')).toBeNull();

    // The other row is unaffected.
    expect(
      rows[1].querySelector('button[aria-label="Actions for Remote Doctrine"]'),
    ).toBeTruthy();
  });

  it('shows a spinner instead of the actions menu while a removal is in flight (FR-024)', async () => {
    const fixture = await renderTable(PACKS, { removingPackId: 'pack-2' });
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    expect(
      rows[1].querySelector('app-loading-indicator[aria-label="Removing pack"]'),
    ).toBeTruthy();
    expect(rows[1].querySelector('button[aria-label="Actions for Remote Doctrine"]')).toBeNull();

    expect(
      rows[0].querySelector('button[aria-label="Actions for Doctrine Core"]'),
    ).toBeTruthy();
  });

  it('shows a spinner instead of the actions menu while a refresh is in flight (FR-024)', async () => {
    const fixture = await renderTable(PACKS, { refreshingPackId: 'pack-1' });
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    expect(
      rows[0].querySelector('app-loading-indicator[aria-label="Refreshing pack"]'),
    ).toBeTruthy();
    expect(rows[0].querySelector('button[aria-label="Actions for Doctrine Core"]')).toBeNull();

    expect(
      rows[1].querySelector('button[aria-label="Actions for Remote Doctrine"]'),
    ).toBeTruthy();
  });

  it('renders no rows for an empty pack list (FR-008)', async () => {
    const fixture = await renderTable([]);

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('shows a warning button naming the broken parent for missing/broken-ancestor packs (FR-003/FR-009/FR-010)', async () => {
    const fixture = await renderTable(PACKS, {
      parentStatus: {
        'pack-1': { status: 'missing', broken_ref: 'acme' },
        'pack-2': { status: 'broken-ancestor', broken_pack_name: 'Legacy Base' },
      },
    });
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    const firstWarning = rows[0].querySelector<HTMLButtonElement>(
      'td:first-child button[aria-label*="acme"]',
    );
    expect(firstWarning).toBeTruthy();
    expect(firstWarning!.getAttribute('aria-label')).toContain('is not imported');

    const secondWarning = rows[1].querySelector<HTMLButtonElement>(
      'td:first-child button[aria-label*="Legacy Base"]',
    );
    expect(secondWarning).toBeTruthy();
  });

  it('shows no warning button when a pack is resolved or absent from the status map (FR-003)', async () => {
    const fixture = await renderTable(PACKS, {
      parentStatus: { 'pack-1': { status: 'resolved' } },
    });
    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');

    expect(rows[0].querySelector('td:first-child button')).toBeNull();
    expect(rows[1].querySelector('td:first-child button')).toBeNull();
  });

  it('hides the Remove menu item for a built-in pack row but keeps Open/Refresh/Export (FR-007)', async () => {
    const builtIn = makePack({ id: 'builtin-1', name: 'Built-in Doctrine', origin: 'built-in' });
    const fixture = await renderTable([builtIn, PACKS[0]]);

    const builtInItems = await openRowActions(fixture, 'Built-in Doctrine');
    expect(findMenuItem(builtInItems, 'Open')).toBeTruthy();
    expect(findMenuItem(builtInItems, 'Refresh')).toBeTruthy();
    expect(findMenuItem(builtInItems, 'Export')).toBeTruthy();
    expect(findMenuItem(builtInItems, 'Remove')).toBeUndefined();
  });

  it('shows the Remove menu item for a non-built-in pack row', async () => {
    const builtIn = makePack({ id: 'builtin-1', name: 'Built-in Doctrine', origin: 'built-in' });
    const fixture = await renderTable([builtIn, PACKS[0]]);

    const ownItems = await openRowActions(fixture, 'Doctrine Core');
    expect(findMenuItem(ownItems, 'Remove')).toBeTruthy();
  });
});
