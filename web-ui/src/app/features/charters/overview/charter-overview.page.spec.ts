import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { CharterApiError, ChartersApiService } from '../data-access';
import type { CharterExportResult, CharterSummary } from '../models';
import { ActiveCharterStore } from '../shared';
import { CharterCreateDialog } from './charter-create-dialog';
import { CharterDeleteDialog } from './charter-delete-dialog';
import { CharterFilters } from './charter-filters';
import { CharterImportDialog } from './charter-import-dialog';
import { CharterOverviewPage } from './charter-overview.page';
import { CharterRenameDialog } from './charter-rename-dialog';
import { makeCharterSummary } from './charter-test-fixtures';

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

class FakeChartersApiService {
  readonly createCalls: string[] = [];
  readonly activateCalls: string[] = [];
  readonly renameCalls: Array<{ id: string; name: string }> = [];
  readonly deleteCalls: string[] = [];
  readonly exportCalls: string[] = [];
  readonly importCalls: File[] = [];

  summaries: CharterSummary[] = [];
  summariesError: unknown = null;
  summariesPending: Deferred<CharterSummary[]> | null = null;
  manualSummaries = false;

  createPending: Deferred<CharterSummary> | null = null;
  activatePending: Deferred<CharterSummary> | null = null;
  renamePending: Deferred<CharterSummary> | null = null;
  deletePending: Deferred<void> | null = null;
  exportPending: Deferred<CharterExportResult> | null = null;
  importPending: Deferred<CharterSummary> | null = null;

  getSummaries(): Promise<CharterSummary[]> {
    if (this.manualSummaries) {
      this.summariesPending = new Deferred<CharterSummary[]>();
      return this.summariesPending.promise;
    }
    if (this.summariesError) {
      return Promise.reject(this.summariesError);
    }
    return Promise.resolve(this.summaries);
  }

  createCharter(name: string): Promise<CharterSummary> {
    this.createCalls.push(name);
    this.createPending = new Deferred<CharterSummary>();
    return this.createPending.promise;
  }

  activateCharter(id: string): Promise<CharterSummary> {
    this.activateCalls.push(id);
    this.activatePending = new Deferred<CharterSummary>();
    return this.activatePending.promise;
  }

  renameCharter(id: string, name: string): Promise<CharterSummary> {
    this.renameCalls.push({ id, name });
    this.renamePending = new Deferred<CharterSummary>();
    return this.renamePending.promise;
  }

  deleteCharter(id: string): Promise<void> {
    this.deleteCalls.push(id);
    this.deletePending = new Deferred<void>();
    return this.deletePending.promise;
  }

  exportCharter(id: string): Promise<CharterExportResult> {
    this.exportCalls.push(id);
    this.exportPending = new Deferred<CharterExportResult>();
    return this.exportPending.promise;
  }

  importCharter(file: File): Promise<CharterSummary> {
    this.importCalls.push(file);
    this.importPending = new Deferred<CharterSummary>();
    return this.importPending.promise;
  }
}

/**
 * Mirrors the real `ActiveCharterStore`: `refresh()` re-fetches from the (fake) API and
 * replaces `charters` wholesale, so `CharterOverviewPage`'s `visibleCharters` — which reads
 * straight from this store — reacts the same way it would against the real store.
 */
class FakeActiveCharterStore {
  readonly setCalls: Array<string | null> = [];
  readonly refreshCalls: number[] = [];
  private count = 0;
  private readonly _charters = signal<CharterSummary[]>([]);
  readonly charters = this._charters.asReadonly();

  constructor(private readonly api: FakeChartersApiService) {}

  setActiveCharterId(id: string | null): void {
    this.setCalls.push(id);
    this._charters.update((charters) => charters.map((charter) => ({ ...charter, active: charter.id === id })));
  }

  async refresh(): Promise<void> {
    this.refreshCalls.push(++this.count);
    this._charters.set(await this.api.getSummaries());
  }
}

const CHARTER_ONE = makeCharterSummary({ id: 'charter-1', name: 'Doctrine Charter', active: false });
const CHARTER_TWO = makeCharterSummary({
  id: 'charter-2',
  name: 'Active Charter',
  active: true,
  enabled_item_count: 3,
});

describe('CharterOverviewPage', () => {
  let api: FakeChartersApiService;
  let store: FakeActiveCharterStore;
  let downloads: Array<{ download: string; href: string }>;
  let createdObjectUrls: Blob[];
  let revokedUrls: string[];

  beforeEach(async () => {
    api = new FakeChartersApiService();
    store = new FakeActiveCharterStore(api);
    downloads = [];
    createdObjectUrls = [];
    revokedUrls = [];

    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      configurable: true,
      value: (blob: Blob) => {
        createdObjectUrls.push(blob);
        return `blob:charter-${createdObjectUrls.length}`;
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
      imports: [CharterOverviewPage],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: ChartersApiService, useValue: api },
        { provide: ActiveCharterStore, useValue: store },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    TestBed.resetTestingModule();
  });

  async function render(summaries: CharterSummary[] = [CHARTER_ONE, CHARTER_TWO]) {
    api.summaries = summaries;
    const fixture = TestBed.createComponent(CharterOverviewPage);
    fixture.detectChanges();
    await settle(fixture);
    // The page's constructor eagerly reloads through the shared store; clear that call so
    // tests only observe refresh/set calls triggered by the action under test.
    store.refreshCalls.length = 0;
    store.setCalls.length = 0;
    return fixture;
  }

  async function settle(fixture: ComponentFixture<CharterOverviewPage>) {
    for (let round = 0; round < 6; round += 1) {
      await Promise.resolve();
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function html(fixture: ComponentFixture<CharterOverviewPage>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function clickButtonByText(fixture: ComponentFixture<CharterOverviewPage>, text: string): void {
    const button = Array.from(html(fixture).querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    expect(button, `no button labelled “${text}”`).toBeTruthy();
    button!.click();
  }

  function loadingLabels(fixture: ComponentFixture<CharterOverviewPage>): string[] {
    return Array.from(html(fixture).querySelectorAll('app-loading-indicator')).map(
      (node) => node.getAttribute('aria-label') ?? '',
    );
  }

  async function clickRowAction(
    fixture: ComponentFixture<CharterOverviewPage>,
    charterName: string,
    actionText: 'Open' | 'Rename' | 'Activate' | 'Export' | 'Delete',
  ): Promise<void> {
    const trigger = html(fixture).querySelector<HTMLButtonElement>(
      `button[aria-label="Actions for ${charterName}"]`,
    );
    expect(trigger, `no actions trigger for “${charterName}”`).toBeTruthy();
    trigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const item = Array.from(
      document.body.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-item"]'),
    ).find((node) => node.textContent?.trim().includes(actionText));
    expect(item, `no “${actionText}” menu item for “${charterName}”`).toBeTruthy();
    item!.click();
    fixture.detectChanges();
  }

  it('shows a loading indicator while the charter list request is in flight (FR-024)', async () => {
    api.manualSummaries = true;
    const fixture = TestBed.createComponent(CharterOverviewPage);
    fixture.detectChanges();

    expect(loadingLabels(fixture)).toContain('Loading charters');
    expect(html(fixture).querySelector('table')).toBeNull();

    api.summariesPending!.resolve([CHARTER_ONE]);
    await settle(fixture);

    expect(loadingLabels(fixture)).not.toContain('Loading charters');
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('renders the filter sidebar next to the charter table (FR-004)', async () => {
    const fixture = await render();

    expect(fixture.debugElement.query(By.directive(CharterFilters))).toBeTruthy();
    const table = html(fixture).querySelector('table[aria-label="Charters"]');
    expect(table).toBeTruthy();
    expect(table!.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('offers a create call to action when no charters exist (FR-002)', async () => {
    const fixture = await render([]);

    const el = html(fixture);
    expect(el.textContent).toContain('No charters found');
    const createButtons = Array.from(el.querySelectorAll('button')).filter(
      (button) => button.textContent?.trim() === 'Create charter',
    );
    expect(createButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('shows a distinct "no results for filters" empty state, with a working reset (FR-004)', async () => {
    const fixture = await render([CHARTER_ONE, CHARTER_TWO]);

    const nameInput = html(fixture).querySelector<HTMLInputElement>('#charter-filter-name')!;
    nameInput.value = 'no-such-charter';
    nameInput.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 260));
    await settle(fixture);

    const el = html(fixture);
    expect(el.textContent).toContain('No charters match your filters');
    expect(el.textContent).not.toContain('No charters found');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(0);

    clickButtonByText(fixture, 'Reset filters');
    await settle(fixture);

    expect(html(fixture).textContent).not.toContain('No charters match your filters');
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(2);
    expect(html(fixture).querySelector<HTMLInputElement>('#charter-filter-name')?.value).toBe('');
  });

  it('narrows the list client-side by active status and has-conflicts (FR-004)', async () => {
    const conflicting = makeCharterSummary({ id: 'charter-3', name: 'Conflicted', has_conflicts: true });
    const fixture = await render([CHARTER_ONE, CHARTER_TWO, conflicting]);

    const filters = fixture.debugElement.query(By.directive(CharterFilters))
      .componentInstance as CharterFilters;
    filters.filtersChange.emit({
      name: '',
      activeStatus: 'active-only',
      hasConflictsOnly: false,
      createdAtFrom: '',
      createdAtTo: '',
      updatedAtFrom: '',
      updatedAtTo: '',
    });
    await new Promise((resolve) => setTimeout(resolve, 260));
    await settle(fixture);

    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
    expect(html(fixture).textContent).toContain('Active Charter');
  });

  it('surfaces a retry-able error when the list request fails', async () => {
    api.summariesError = new CharterApiError('PocketBase unreachable', 503);
    const fixture = await render([]);

    expect(html(fixture).textContent).toContain('PocketBase unreachable');

    api.summariesError = null;
    api.summaries = [CHARTER_ONE];
    clickButtonByText(fixture, 'Retry');
    await settle(fixture);

    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('creates a charter and refreshes the shared active-charter store so it shows up immediately (FR-002/FR-024)', async () => {
    const fixture = await render([CHARTER_ONE]);
    const dialog = fixture.debugElement.query(By.directive(CharterCreateDialog))
      .componentInstance as CharterCreateDialog;

    clickButtonByText(fixture, 'Create charter');
    fixture.detectChanges();
    expect(dialog.open()).toBe(true);

    dialog.created.emit('New Charter');
    fixture.detectChanges();

    expect(api.createCalls).toEqual(['New Charter']);
    expect(dialog.loading()).toBe(true);

    const created = makeCharterSummary({ id: 'charter-9', name: 'New Charter', active: true });
    api.summaries = [makeCharterSummary({ id: CHARTER_ONE.id, name: CHARTER_ONE.name, active: false }), created];
    api.createPending!.resolve(created);
    await settle(fixture);

    expect(dialog.loading()).toBe(false);
    expect(dialog.open()).toBe(false);
    expect(store.refreshCalls).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('“New Charter” was created successfully.');
    expect(html(fixture).textContent).not.toContain('Charter created');
    expect(html(fixture).textContent).toContain('New Charter');
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('keeps a failed create in the dialog without adding ghost rows (FR-002)', async () => {
    const fixture = await render([CHARTER_ONE]);
    const dialog = fixture.debugElement.query(By.directive(CharterCreateDialog))
      .componentInstance as CharterCreateDialog;

    clickButtonByText(fixture, 'Create charter');
    fixture.detectChanges();

    dialog.created.emit('Bad Name');
    api.createPending!.reject(new CharterApiError('Name already exists', 400));
    await settle(fixture);

    expect(dialog.error()).toBe('Name already exists');
    expect(dialog.open()).toBe(true);
    expect(dialog.loading()).toBe(false);
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('activates a charter and updates the active-charter store (FR-024)', async () => {
    const fixture = await render([CHARTER_ONE, CHARTER_TWO]);

    await clickRowAction(fixture, 'Doctrine Charter', 'Activate');

    expect(api.activateCalls).toEqual(['charter-1']);
    expect(loadingLabels(fixture)).toEqual(
      expect.arrayContaining(['Activate in progress', 'Activating charter']),
    );

    api.summaries = [
      makeCharterSummary({ id: 'charter-1', name: 'Doctrine Charter', active: true }),
      makeCharterSummary({ id: 'charter-2', name: 'Active Charter', active: false }),
    ];
    api.activatePending!.resolve(CHARTER_ONE);
    await settle(fixture);

    expect(store.setCalls).toEqual(['charter-1']);
    expect(loadingLabels(fixture)).not.toContain('Activate in progress');
    expect(toast.success).toHaveBeenCalledWith('“Doctrine Charter” is now the active charter.');
  });

  it('renames a charter, pre-filling the current name, and reloads the list (FR-002/FR-023)', async () => {
    const fixture = await render([CHARTER_ONE]);
    const dialog = fixture.debugElement.query(By.directive(CharterRenameDialog))
      .componentInstance as CharterRenameDialog;

    await clickRowAction(fixture, 'Doctrine Charter', 'Rename');

    expect(dialog.open()).toBe(true);
    expect(dialog.charter()?.name).toBe('Doctrine Charter');

    dialog.renamed.emit('Renamed Charter');
    fixture.detectChanges();

    expect(api.renameCalls).toEqual([{ id: 'charter-1', name: 'Renamed Charter' }]);

    api.summaries = [makeCharterSummary({ id: 'charter-1', name: 'Renamed Charter' })];
    api.renamePending!.resolve(api.summaries[0]);
    await settle(fixture);

    expect(dialog.open()).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('“Doctrine Charter” was renamed to “Renamed Charter”.');
    expect(html(fixture).textContent).toContain('Renamed Charter');
  });

  it('deletes an inactive charter and refreshes the shared store so the row disappears everywhere (FR-005)', async () => {
    const fixture = await render([CHARTER_ONE]);
    const deleteDialog = fixture.debugElement.query(By.directive(CharterDeleteDialog))
      .componentInstance as CharterDeleteDialog;

    await clickRowAction(fixture, 'Doctrine Charter', 'Delete');

    expect(deleteDialog.open()).toBe(true);
    expect(deleteDialog.charter()?.id).toBe('charter-1');

    deleteDialog.confirmed.emit({ confirmed: true, toggleValue: false });
    fixture.detectChanges();

    expect(api.deleteCalls).toEqual(['charter-1']);
    expect(loadingLabels(fixture)).toEqual(
      expect.arrayContaining(['Delete in progress', 'Deleting charter']),
    );

    api.summaries = [];
    api.deletePending!.resolve();
    await settle(fixture);

    expect(store.refreshCalls).toHaveLength(1);
    expect(loadingLabels(fixture)).not.toContain('Delete in progress');
    expect(toast.success).toHaveBeenCalledWith('“Doctrine Charter” was deleted.');
    expect(html(fixture).textContent).not.toContain('Charter deleted');
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('refreshes the shared active-charter store after deleting the active charter (FR-005)', async () => {
    const fixture = await render([CHARTER_TWO]);
    const deleteDialog = fixture.debugElement.query(By.directive(CharterDeleteDialog))
      .componentInstance as CharterDeleteDialog;

    await clickRowAction(fixture, 'Active Charter', 'Delete');
    expect(deleteDialog.charter()?.active).toBe(true);

    deleteDialog.confirmed.emit({ confirmed: true, toggleValue: false });
    api.summaries = [];
    api.deletePending!.resolve();
    await settle(fixture);

    expect(store.refreshCalls).toHaveLength(1);
  });

  it('does not call the delete API when the dialog is cancelled', async () => {
    const fixture = await render([CHARTER_ONE]);
    const deleteDialog = fixture.debugElement.query(By.directive(CharterDeleteDialog))
      .componentInstance as CharterDeleteDialog;

    await clickRowAction(fixture, 'Doctrine Charter', 'Delete');
    deleteDialog.confirmed.emit({ confirmed: false, toggleValue: false });
    await settle(fixture);

    expect(api.deleteCalls).toHaveLength(0);
  });

  it('downloads the exported ZIP and shows loading while exporting (FR-018/FR-024)', async () => {
    const fixture = await render([CHARTER_ONE]);

    await clickRowAction(fixture, 'Doctrine Charter', 'Export');

    expect(api.exportCalls).toEqual(['charter-1']);
    expect(loadingLabels(fixture)).toEqual(
      expect.arrayContaining(['Export in progress', 'Exporting charter']),
    );

    const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
    api.exportPending!.resolve({
      blob,
      filename: 'doctrine-charter.zip',
      validationStatus: 'valid',
      validationErrors: null,
    });
    await settle(fixture);

    expect(createdObjectUrls).toEqual([blob]);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].download).toBe('doctrine-charter.zip');
    expect(revokedUrls).toHaveLength(1);
    expect(loadingLabels(fixture)).not.toContain('Export in progress');
    expect(html(fixture).textContent).not.toContain('validation errors');
  });

  it('still downloads the ZIP but toasts validation errors without blocking the download (FR-018)', async () => {
    const fixture = await render([CHARTER_ONE]);

    await clickRowAction(fixture, 'Doctrine Charter', 'Export');

    api.exportPending!.resolve({
      blob: new Blob(['zip-bytes'], { type: 'application/zip' }),
      filename: null,
      validationStatus: 'errors',
      validationErrors: [{ message: 'item references a missing artifact' }],
    });
    await settle(fixture);

    expect(downloads).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith('item references a missing artifact');
  });

  it('reports export failures without downloading anything', async () => {
    const fixture = await render([CHARTER_ONE]);

    await clickRowAction(fixture, 'Doctrine Charter', 'Export');
    api.exportPending!.reject(new CharterApiError('Charter has no enabled items', 400));
    await settle(fixture);

    expect(downloads).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith('Charter has no enabled items');
    expect(loadingLabels(fixture)).not.toContain('Export in progress');
  });

  it('imports a charter and refreshes the shared active-charter store so it shows up immediately (FR-019/FR-024)', async () => {
    const fixture = await render([CHARTER_ONE]);
    const dialog = fixture.debugElement.query(By.directive(CharterImportDialog))
      .componentInstance as CharterImportDialog;

    clickButtonByText(fixture, 'Import charter');
    fixture.detectChanges();
    expect(dialog.open()).toBe(true);

    const file = new File(['zip-bytes'], 'charter-bundle.zip', { type: 'application/zip' });
    dialog.imported.emit(file);
    fixture.detectChanges();

    expect(api.importCalls).toEqual([file]);
    expect(dialog.loading()).toBe(true);

    const imported = makeCharterSummary({ id: 'charter-9', name: 'Imported Charter', active: true });
    api.summaries = [makeCharterSummary({ id: CHARTER_ONE.id, name: CHARTER_ONE.name, active: false }), imported];
    api.importPending!.resolve(imported);
    await settle(fixture);

    expect(dialog.loading()).toBe(false);
    expect(dialog.open()).toBe(false);
    expect(store.refreshCalls).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('“Imported Charter” was imported successfully.');
    expect(html(fixture).textContent).toContain('Imported Charter');
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('keeps a structurally invalid import in the dialog without adding a ghost charter row (FR-021)', async () => {
    const fixture = await render([CHARTER_ONE]);
    const dialog = fixture.debugElement.query(By.directive(CharterImportDialog))
      .componentInstance as CharterImportDialog;

    clickButtonByText(fixture, 'Import charter');
    fixture.detectChanges();

    const file = new File(['bad-bytes'], 'bad-bundle.zip', { type: 'application/zip' });
    dialog.imported.emit(file);
    api.importPending!.reject(new CharterApiError('Bundle is not a valid charter export.', 400));
    await settle(fixture);

    expect(dialog.error()).toBe('Bundle is not a valid charter export.');
    expect(dialog.open()).toBe(true);
    expect(dialog.loading()).toBe(false);
    expect(store.setCalls).toEqual([]);
    expect(html(fixture).querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
