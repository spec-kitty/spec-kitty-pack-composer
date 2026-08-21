import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';
import type { ListResult } from 'pocketbase';

import { PacksApiError, PacksApiService, PacksReadService } from '../data-access';
import type {
  Pack,
  PackExportResult,
  PackListFilters,
  PackSummary,
  ParentStatusMap,
} from '../models';
import { PackFilters } from './pack-filters';
import { PackImportDialog } from './pack-import-dialog';
import { PackOverviewPage } from './pack-overview.page';
import { PackRemoveDialog } from './pack-remove-dialog';
import { makePack } from './pack-test-fixtures';

vi.mock('@spartan-ng/brain/sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

class Deferred<T> {
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;
  readonly promise: Promise<T>;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

function listResult(items: Pack[]): ListResult<Pack> {
  return { page: 1, perPage: 50, totalItems: items.length, totalPages: 1, items };
}

class FakePacksReadService {
  readonly calls: PackListFilters[] = [];
  items: Pack[] = [];
  error: unknown = null;
  pending: Deferred<ListResult<Pack>> | null = null;
  manual = false;

  list(filters: PackListFilters = {}): Promise<ListResult<Pack>> {
    this.calls.push(filters);
    if (this.manual) {
      this.pending = new Deferred<ListResult<Pack>>();
      return this.pending.promise;
    }
    if (this.error) {
      return Promise.reject(this.error);
    }
    return Promise.resolve(listResult(this.items));
  }
}

class FakePacksApiService {
  readonly importCalls: string[] = [];
  readonly refreshCalls: string[] = [];
  readonly exportCalls: string[] = [];
  readonly removeCalls: Array<{ id: string; deleteFiles: boolean }> = [];

  importPending: Deferred<PackSummary> | null = null;
  refreshPending: Deferred<PackSummary> | null = null;
  exportPending: Deferred<PackExportResult> | null = null;
  removePending: Deferred<void> | null = null;

  parentStatus: ParentStatusMap = {};
  parentStatusError: unknown = null;

  importPack(sourcePath: string): Promise<PackSummary> {
    this.importCalls.push(sourcePath);
    this.importPending = new Deferred<PackSummary>();
    return this.importPending.promise;
  }

  refreshPack(id: string): Promise<PackSummary> {
    this.refreshCalls.push(id);
    this.refreshPending = new Deferred<PackSummary>();
    return this.refreshPending.promise;
  }

  exportPack(id: string): Promise<PackExportResult> {
    this.exportCalls.push(id);
    this.exportPending = new Deferred<PackExportResult>();
    return this.exportPending.promise;
  }

  removePack(id: string, deleteFiles = false): Promise<void> {
    this.removeCalls.push({ id, deleteFiles });
    this.removePending = new Deferred<void>();
    return this.removePending.promise;
  }

  getParentStatus(): Promise<ParentStatusMap> {
    if (this.parentStatusError) {
      return Promise.reject(this.parentStatusError);
    }
    return Promise.resolve(this.parentStatus);
  }
}

const LOCAL_PACK = makePack({ id: 'pack-1', name: 'Doctrine Core', origin: 'local' });
const REMOTE_PACK = makePack({ id: 'pack-2', name: 'Remote Doctrine', origin: 'remote' });

describe('PackOverviewPage', () => {
  let read: FakePacksReadService;
  let api: FakePacksApiService;
  let downloads: Array<{ download: string; href: string }>;
  let createdObjectUrls: Blob[];
  let revokedUrls: string[];

  beforeEach(async () => {
    read = new FakePacksReadService();
    api = new FakePacksApiService();
    downloads = [];
    createdObjectUrls = [];
    revokedUrls = [];

    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      configurable: true,
      value: (blob: Blob) => {
        createdObjectUrls.push(blob);
        return `blob:pack-${createdObjectUrls.length}`;
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      configurable: true,
      value: (url: string) => {
        revokedUrls.push(url);
      },
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ download: this.download, href: this.href });
    });

    await TestBed.configureTestingModule({
      imports: [PackOverviewPage],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: PacksReadService, useValue: read },
        { provide: PacksApiService, useValue: api },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    TestBed.resetTestingModule();
  });

  async function render(packs: Pack[] = [LOCAL_PACK, REMOTE_PACK]) {
    read.items = packs;
    const fixture = TestBed.createComponent(PackOverviewPage);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  async function settle(fixture: ComponentFixture<PackOverviewPage>) {
    // Overview handlers chain several awaits (API call → list refresh → reset loading).
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function html(fixture: ComponentFixture<PackOverviewPage>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function clickButtonByText(fixture: ComponentFixture<PackOverviewPage>, text: string): void {
    const button = Array.from(html(fixture).querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    expect(button, `no button labelled “${text}”`).toBeTruthy();
    button!.click();
  }

  function loadingLabels(fixture: ComponentFixture<PackOverviewPage>): string[] {
    return Array.from(html(fixture).querySelectorAll('app-loading-indicator')).map(
      (node) => node.getAttribute('aria-label') ?? '',
    );
  }

  /** Opens a row's "..." actions menu (portaled to `document.body`) and clicks the named item. */
  async function clickRowAction(
    fixture: ComponentFixture<PackOverviewPage>,
    packName: string,
    actionText: 'Open' | 'Refresh' | 'Export' | 'Remove',
  ): Promise<void> {
    const trigger = html(fixture).querySelector<HTMLButtonElement>(
      `button[aria-label="Actions for ${packName}"]`,
    );
    expect(trigger, `no actions trigger for “${packName}”`).toBeTruthy();
    trigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const item = Array.from(
      document.body.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]'),
    ).find((node) => node.textContent?.trim().includes(actionText));
    expect(item, `no “${actionText}” menu item for “${packName}”`).toBeTruthy();
    item!.click();
    fixture.detectChanges();
  }

  it('shows a loading indicator while the pack list request is in flight (FR-024)', async () => {
    read.manual = true;
    const fixture = TestBed.createComponent(PackOverviewPage);
    fixture.detectChanges();

    expect(loadingLabels(fixture)).toContain('Loading packs');
    expect(html(fixture).querySelector('table')).toBeNull();

    read.pending!.resolve(listResult([LOCAL_PACK]));
    await settle(fixture);

    expect(loadingLabels(fixture)).not.toContain('Loading packs');
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('renders the filter sidebar next to the pack table (FR-008/FR-009)', async () => {
    const fixture = await render();

    expect(fixture.debugElement.query(By.directive(PackFilters))).toBeTruthy();
    const table = html(fixture).querySelector('table[aria-label="Indexed packs"]');
    expect(table).toBeTruthy();
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('offers an import call to action when no packs are indexed (FR-005/FR-008)', async () => {
    const fixture = await render([]);

    const el = html(fixture);
    expect(el.textContent).toContain('No packs found');
    const importButtons = Array.from(el.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === 'Import pack',
    );
    expect(importButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('shows a distinct "no results for filters" empty state, with a working reset (FR-009/FR-014)', async () => {
    const fixture = await render([LOCAL_PACK, REMOTE_PACK]);

    read.items = [];
    const nameInput = html(fixture).querySelector<HTMLInputElement>('#pack-filter-name')!;
    nameInput.value = 'no-such-pack';
    nameInput.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 260));
    await settle(fixture);

    const el = html(fixture);
    expect(el.textContent).toContain('No packs match your filters');
    expect(el.textContent).not.toContain('No packs found');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(0);

    read.items = [LOCAL_PACK, REMOTE_PACK];
    clickButtonByText(fixture, 'Reset filters');
    await settle(fixture);

    expect(read.calls.at(-1)).toEqual({});
    expect(html(fixture).textContent).not.toContain('No packs match your filters');
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(2);
    expect(html(fixture).querySelector<HTMLInputElement>('#pack-filter-name')?.value).toBe('');
  });

  it('shows the filtered empty state for the client-side missing-parent-only toggle too (FR-014)', async () => {
    const fixture = await render([LOCAL_PACK, REMOTE_PACK]);
    api.parentStatus = { 'pack-1': { status: 'resolved' }, 'pack-2': { status: 'resolved' } };

    const filters = fixture.debugElement.query(By.directive(PackFilters))
      .componentInstance as PackFilters;
    filters.form.set({ ...filters.form(), missingParentOnly: true });
    await settle(fixture);

    const el = html(fixture);
    expect(el.textContent).toContain('No packs match your filters');
    const resetButton = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Reset filters',
    );
    expect(resetButton).toBeTruthy();
  });

  it('surfaces a retry-able error when the list request fails', async () => {
    read.error = new PacksApiError('PocketBase unreachable', 503);
    const fixture = await render([]);

    expect(html(fixture).textContent).toContain('PocketBase unreachable');
    expect(read.calls).toHaveLength(1);

    read.error = null;
    read.items = [LOCAL_PACK];
    clickButtonByText(fixture, 'Retry');
    await settle(fixture);

    expect(read.calls).toHaveLength(2);
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('re-queries packs with mapped sidebar filters (FR-009/FR-010)', async () => {
    const fixture = await render();
    const filters = fixture.debugElement.query(By.directive(PackFilters))
      .componentInstance as PackFilters;

    filters.filtersChange.emit({ name: 'core', origin: 'remote' });
    await new Promise((resolve) => setTimeout(resolve, 260));
    await settle(fixture);

    expect(read.calls.at(-1)).toEqual({ name: 'core', origin: 'remote' });
  });

  it('imports a pack from a filesystem path and refreshes the list (FR-005/FR-024)', async () => {
    const fixture = await render([LOCAL_PACK]);
    const dialog = fixture.debugElement.query(By.directive(PackImportDialog))
      .componentInstance as PackImportDialog;

    clickButtonByText(fixture, 'Import pack');
    fixture.detectChanges();
    expect(dialog.open()).toBe(true);

    dialog.importRequested.emit('/var/packs/doctrine-core');
    fixture.detectChanges();

    expect(api.importCalls).toEqual(['/var/packs/doctrine-core']);
    expect(dialog.loading()).toBe(true);

    read.items = [LOCAL_PACK, REMOTE_PACK];
    api.importPending!.resolve({
      id: 'pack-2',
      name: 'Remote Doctrine',
      origin: 'local',
      imported_at: LOCAL_PACK.imported_at,
      updated_at: LOCAL_PACK.updated_at,
    });
    await settle(fixture);

    expect(dialog.loading()).toBe(false);
    expect(dialog.open()).toBe(false);
    expect(read.calls).toHaveLength(2);
    expect(toast.success).toHaveBeenCalledWith('The pack was imported successfully.');
  });

  it('keeps a failed import in the dialog without adding ghost rows (FR-005)', async () => {
    const fixture = await render([LOCAL_PACK]);
    const dialog = fixture.debugElement.query(By.directive(PackImportDialog))
      .componentInstance as PackImportDialog;

    clickButtonByText(fixture, 'Import pack');
    fixture.detectChanges();

    dialog.importRequested.emit('/nope');
    api.importPending!.reject(new PacksApiError('Pack manifest missing', 400));
    await settle(fixture);

    expect(dialog.error()).toBe('Pack manifest missing');
    expect(dialog.open()).toBe(true);
    expect(dialog.loading()).toBe(false);
    expect(read.calls).toHaveLength(1);
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('refreshes a pack from the row actions menu and reloads the list (FR-024)', async () => {
    const fixture = await render([LOCAL_PACK]);

    await clickRowAction(fixture, 'Doctrine Core', 'Refresh');

    expect(api.refreshCalls).toEqual(['pack-1']);
    expect(loadingLabels(fixture)).toEqual(
      expect.arrayContaining(['Refresh in progress', 'Refreshing pack']),
    );

    api.refreshPending!.resolve({
      id: 'pack-1',
      name: 'Doctrine Core',
      origin: 'local',
      imported_at: LOCAL_PACK.imported_at,
      updated_at: '2026-05-01T00:00:00.000Z',
    });
    await settle(fixture);

    expect(read.calls).toHaveLength(2);
    expect(loadingLabels(fixture)).not.toContain('Refresh in progress');
    expect(toast.success).toHaveBeenCalledWith('“Doctrine Core” was refreshed from its source.');
  });

  it('reports refresh failures and clears the loading state (FR-024)', async () => {
    const fixture = await render([LOCAL_PACK]);

    await clickRowAction(fixture, 'Doctrine Core', 'Refresh');
    api.refreshPending!.reject(new PacksApiError('Pack source path missing', 404));
    await settle(fixture);

    expect(toast.error).toHaveBeenCalledWith('Pack source path missing');
    expect(loadingLabels(fixture)).not.toContain('Refresh in progress');
  });

  it('downloads the exported ZIP and shows loading while exporting (FR-011/FR-024)', async () => {
    const fixture = await render([LOCAL_PACK]);

    await clickRowAction(fixture, 'Doctrine Core', 'Export');

    expect(api.exportCalls).toEqual(['pack-1']);
    expect(loadingLabels(fixture)).toEqual(
      expect.arrayContaining(['Export in progress', 'Exporting pack']),
    );

    const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
    api.exportPending!.resolve({
      blob,
      filename: 'doctrine-core-1.2.3.zip',
      validationStatus: 'valid',
      validationErrors: null,
    });
    await settle(fixture);

    expect(createdObjectUrls).toEqual([blob]);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].download).toBe('doctrine-core-1.2.3.zip');
    expect(revokedUrls).toHaveLength(1);
    expect(loadingLabels(fixture)).not.toContain('Export in progress');
    expect(html(fixture).textContent).not.toContain('validation errors');
  });

  it('still downloads the ZIP but toasts validation errors (FR-012)', async () => {
    const fixture = await render([LOCAL_PACK]);

    await clickRowAction(fixture, 'Doctrine Core', 'Export');

    api.exportPending!.resolve({
      blob: new Blob(['zip-bytes'], { type: 'application/zip' }),
      filename: null,
      validationStatus: 'errors',
      validationErrors: [{ message: 'directive DIR-1 has no title' }, 'glossary term duplicated'],
    });
    await settle(fixture);

    expect(downloads).toHaveLength(1);
    expect(downloads[0].download).toBe('Doctrine Core-1.2.3.zip');
    expect(toast.error).toHaveBeenCalledWith(
      'directive DIR-1 has no title; glossary term duplicated',
    );
  });

  it('reports export failures without downloading anything (FR-011)', async () => {
    const fixture = await render([LOCAL_PACK]);

    await clickRowAction(fixture, 'Doctrine Core', 'Export');
    api.exportPending!.reject(new PacksApiError('Pack source path missing', 404));
    await settle(fixture);

    expect(downloads).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith('Pack source path missing');
    expect(loadingLabels(fixture)).not.toContain('Export in progress');
  });

  it('removes a pack after confirmation and shows loading during the call (FR-013/FR-014/FR-024)', async () => {
    const fixture = await render([LOCAL_PACK]);
    const removeDialog = fixture.debugElement.query(By.directive(PackRemoveDialog))
      .componentInstance as PackRemoveDialog;

    await clickRowAction(fixture, 'Doctrine Core', 'Remove');

    expect(removeDialog.open()).toBe(true);
    expect(removeDialog.pack()?.id).toBe('pack-1');
    expect(removeDialog.deleteFiles()).toBe(false);
    expect(api.removeCalls).toHaveLength(0);

    removeDialog.confirmed.emit({ confirmed: true, toggleValue: true });
    fixture.detectChanges();

    expect(api.removeCalls).toEqual([{ id: 'pack-1', deleteFiles: true }]);
    expect(loadingLabels(fixture)).toEqual(
      expect.arrayContaining(['Remove in progress', 'Removing pack']),
    );

    read.items = [];
    api.removePending!.resolve();
    await settle(fixture);

    expect(read.calls).toHaveLength(2);
    expect(loadingLabels(fixture)).not.toContain('Remove in progress');
    expect(toast.success).toHaveBeenCalledWith('“Doctrine Core” was removed from the index.');
  });

  it('never asks the backend to delete disk files for remote packs (FR-015)', async () => {
    const fixture = await render([REMOTE_PACK]);
    const removeDialog = fixture.debugElement.query(By.directive(PackRemoveDialog))
      .componentInstance as PackRemoveDialog;

    await clickRowAction(fixture, 'Remote Doctrine', 'Remove');
    removeDialog.confirmed.emit({ confirmed: true, toggleValue: true });
    api.removePending!.resolve();
    await settle(fixture);

    expect(api.removeCalls).toEqual([{ id: 'pack-2', deleteFiles: false }]);
  });

  it('does not call the remove API when the dialog is cancelled (FR-014)', async () => {
    const fixture = await render([LOCAL_PACK]);
    const removeDialog = fixture.debugElement.query(By.directive(PackRemoveDialog))
      .componentInstance as PackRemoveDialog;

    await clickRowAction(fixture, 'Doctrine Core', 'Remove');
    removeDialog.confirmed.emit({ confirmed: false, toggleValue: false });
    await settle(fixture);

    expect(api.removeCalls).toHaveLength(0);
  });

  it('reports remove failures and clears the loading state (FR-013/FR-024)', async () => {
    const fixture = await render([LOCAL_PACK]);
    const removeDialog = fixture.debugElement.query(By.directive(PackRemoveDialog))
      .componentInstance as PackRemoveDialog;

    await clickRowAction(fixture, 'Doctrine Core', 'Remove');
    removeDialog.confirmed.emit({ confirmed: true, toggleValue: false });
    api.removePending!.reject(new PacksApiError('Pack is locked', 409));
    await settle(fixture);

    expect(toast.error).toHaveBeenCalledWith('Pack is locked');
    expect(loadingLabels(fixture)).not.toContain('Remove in progress');
    expect(read.calls).toHaveLength(1);
  });

  it('fetches parent status alongside the pack list and narrows via the missing-parent filter (FR-003/FR-014)', async () => {
    const brokenPack = makePack({ id: 'pack-3', name: 'Broken Doctrine', origin: 'local' });
    api.parentStatus = {
      'pack-1': { status: 'resolved' },
      'pack-2': { status: 'resolved' },
      'pack-3': { status: 'missing', broken_ref: 'acme' },
    };
    const fixture = await render([LOCAL_PACK, REMOTE_PACK, brokenPack]);

    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(3);
    expect(
      html(fixture).querySelector('button[aria-label*="acme"]'),
    ).toBeTruthy();

    const checkbox = html(fixture).querySelector<HTMLElement>('#pack-filter-missing-parent')!;
    expect(checkbox).toBeTruthy();
    checkbox.click();
    await settle(fixture);

    const narrowedRows = html(fixture).querySelectorAll('tbody tr');
    expect(narrowedRows).toHaveLength(1);
    expect(html(fixture).textContent).toContain('Broken Doctrine');

    checkbox.click();
    await settle(fixture);

    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('does not fail the page when the parent-status call fails (soft failure)', async () => {
    api.parentStatusError = new PacksApiError('Status unavailable', 500);
    const fixture = await render([LOCAL_PACK]);

    expect(html(fixture).textContent).not.toContain('Could not load packs');
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('builds every interactive control from the spartan design system (NFR-002)', async () => {
    const fixture = await render([LOCAL_PACK]);
    const el = html(fixture);

    const buttons = Array.from(el.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    // hlm-checkbox renders its own spartan `brn-checkbox` button (role="checkbox"), not an hlmBtn.
    expect(
      buttons.filter(
        (button) => !button.hasAttribute('hlmbtn') && button.getAttribute('role') !== 'checkbox',
      ),
    ).toEqual([]);

    const inputs = Array.from(el.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.filter((input) => !input.hasAttribute('hlminput'))).toEqual([]);

    const selects = Array.from(el.querySelectorAll('select'));
    expect(selects.length).toBeGreaterThan(0);
    expect(selects.filter((select) => !select.closest('hlm-native-select'))).toEqual([]);

    expect(el.querySelector('table[hlmtable]')).toBeTruthy();
  });
});
