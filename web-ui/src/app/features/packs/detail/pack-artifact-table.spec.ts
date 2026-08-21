import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ArtifactsReadService, CharterMembershipService, membershipKey } from '../data-access';
import type { CharterItem } from '../../charters/models';
import { ActiveCharterStore } from '../../charters/shared';
import type { ResolvedArtifact } from '../models';
import { PackArtifactTable } from './pack-artifact-table';
import { makeArtifact, makeResolvedArtifact } from './test-fixtures';

function charterItem(overrides: Partial<CharterItem> = {}): CharterItem {
  return {
    id: 'item-1',
    charter: 'charter-1',
    pack_artifact: 'rec-1',
    pack_name: 'Acme Pack',
    artifact_type: 'directive',
    artifact_id: 'DIR_001',
    artifact_name: 'Alpha',
    enabled: true,
    ...overrides,
  };
}

describe('PackArtifactTable (FR-011 / FR-013 / FR-020 / FR-025 / NFR-002 / NFR-003)', () => {
  let listResolved: ReturnType<typeof vi.fn>;
  let listByPackAndType: ReturnType<typeof vi.fn>;
  let isInActiveCharter: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    // jsdom doesn't implement scrollIntoView; the command list uses it to keep
    // the active item in view when opened.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(async () => {
    listResolved = vi.fn();
    listByPackAndType = vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      perPage: 500,
      totalItems: 0,
      totalPages: 0,
    });
    isInActiveCharter = vi.fn().mockResolvedValue(null);
    await TestBed.configureTestingModule({
      imports: [PackArtifactTable],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: ArtifactsReadService, useValue: { listResolved, listByPackAndType } },
        {
          provide: CharterMembershipService,
          useValue: { isInActiveCharter, add: vi.fn(), remove: vi.fn() },
        },
        {
          provide: ActiveCharterStore,
          useValue: { activeCharterId: () => null, hasActiveCharter: () => false },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  /** `load()` also kicks off a parallel record-id resolution — flush stability a few times. */
  async function settle(fixture: ReturnType<typeof TestBed.createComponent>): Promise<void> {
    fixture.detectChanges();
    for (let i = 0; i < 6; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  it('loads via listResolved, filters by artifact_type, shows category chips, labeled search/sort, and count', async () => {
    const items: ResolvedArtifact[] = [
      makeResolvedArtifact({ artifact_id: 'DIR_001', name: 'Alpha', category: 'governance' }),
      makeResolvedArtifact({
        artifact_id: 'DIR_002',
        name: 'Beta',
        category: 'security',
      }),
      makeResolvedArtifact({ artifact_id: 'PROF_001', name: 'Other type', artifact_type: 'profile' }),
    ];
    listResolved.mockResolvedValue(items);

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(listResolved).toHaveBeenCalledWith('pack-1');

    // Client-side type filter: the profile artifact must not leak into the directive tab.
    expect(el.textContent).not.toContain('Other type');

    const chipGroup = el.querySelector('[role="group"][aria-label="Category filters"]');
    expect(chipGroup).toBeTruthy();
    expect(chipGroup?.textContent).toContain('governance');
    expect(chipGroup?.textContent).toContain('security');

    const governanceChip = Array.from(chipGroup!.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('governance'),
    );
    expect(governanceChip?.getAttribute('aria-pressed')).toBe('false');
    governanceChip!.click();
    fixture.detectChanges();
    expect(governanceChip?.getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('1 result');
    expect(el.textContent).toContain('Alpha');
    expect(el.textContent).not.toContain('Beta');

    const search = el.querySelector('#artifact-search-directive') as HTMLInputElement;
    const sort = el.querySelector('#artifact-sort-directive');
    expect(search).toBeTruthy();
    expect(el.querySelector('label[for="artifact-search-directive"]')?.textContent).toContain(
      'Search',
    );
    expect(el.querySelector('label[for="artifact-sort-directive"]')?.textContent).toContain('Sort');
    expect(sort).toBeTruthy();

    // Display-only table: no editors (FR-025 / C-002).
    expect(el.querySelector('textarea, [contenteditable="true"]')).toBeNull();
    expect(el.querySelector('table')).toBeTruthy();
  });

  it('applies search and sort client-side without additional network calls', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({ artifact_id: 'DIR_001', name: 'Alpha' }),
      makeResolvedArtifact({ artifact_id: 'DIR_002', name: 'Zeta' }),
    ]);

    vi.useFakeTimers();
    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    listResolved.mockClear();

    const search = (fixture.nativeElement as HTMLElement).querySelector(
      '#artifact-search-directive',
    ) as HTMLInputElement;
    expect(search).toBeTruthy();
    fixture.componentInstance['onSearchChange']('alpha');
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Alpha');
    expect(el.textContent).not.toContain('Zeta');
    // Search/sort no longer trigger a network re-fetch (client-side filtering pipeline).
    expect(listResolved).not.toHaveBeenCalled();

    fixture.componentInstance['onSortChange']('-name');
    fixture.componentInstance['search'].set('');
    fixture.detectChanges();

    const names = Array.from(el.querySelectorAll('tbody tr td:nth-child(1)')).map((td) =>
      td.textContent?.trim(),
    );
    expect(names[0]).toBe('Zeta');
    expect(listResolved).not.toHaveBeenCalled();
  });

  it('shows loading indicator while the fetch is in flight (FR-024)', async () => {
    let resolveList!: (value: ResolvedArtifact[]) => void;
    listResolved.mockReturnValue(
      new Promise<ResolvedArtifact[]>((resolve) => {
        resolveList = resolve;
      }),
    );

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-loading-indicator')).toBeTruthy();
    expect(el.textContent).toContain('Loading artifacts');

    resolveList([]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('app-loading-indicator')).toBeNull();
  });

  it('shows an origin badge per row and narrows via the Origin filter (FR-011/FR-013)', async () => {
    const items: ResolvedArtifact[] = [
      makeResolvedArtifact({ artifact_id: 'DIR_OWN', name: 'Own One', origin: 'own' }),
      makeResolvedArtifact({
        artifact_id: 'DIR_PARENT',
        name: 'Parent One',
        origin: 'parent',
        source_pack_name: 'Base Pack',
      }),
      makeResolvedArtifact({ artifact_id: 'DIR_BUILTIN', name: 'Builtin One', origin: 'built-in' }),
    ];
    listResolved.mockResolvedValue(items);

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Own');
    // Parent-origin badge shows an icon + the project key visibly, with the full
    // "Inherited from X" text exposed as an accessible name (non-color-only cue, NFR-003).
    expect(el.textContent).toContain('Base Pack');
    expect(el.textContent).not.toContain('Inherited from Base Pack');
    const parentBadge = el.querySelector('[aria-label="Inherited from Base Pack"]');
    expect(parentBadge).toBeTruthy();
    expect(parentBadge?.getAttribute('tabindex')).toBe('0');
    expect(el.textContent).toContain('Built-in');

    const originTrigger = el.querySelector<HTMLButtonElement>('[aria-label="Origin filter"]');
    expect(originTrigger).toBeTruthy();
    originTrigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const builtinItem = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[hlm-command-item]'),
    ).find((button) => button.textContent?.includes('Built-in'));
    builtinItem!.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Builtin One');
    expect(el.textContent).not.toContain('Own One');
    expect(el.textContent).not.toContain('Parent One');
    expect(el.textContent).toContain('1 result');
  });

  it('renders each resolved artifact exactly once — no client-side re-duplication (FR-012)', async () => {
    // The server (`/resolved`) has already applied own-wins de-duplication; this fixture
    // models that contract by returning a single entry per (artifact_type, artifact_id) pair.
    const items: ResolvedArtifact[] = [
      makeResolvedArtifact({ artifact_id: 'DIR_SHARED', name: 'Shared Directive', origin: 'own' }),
    ];
    listResolved.mockResolvedValue(items);

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(el.textContent).toContain('1 result');
  });

  it('shows a retryable error state when the request is aborted, and reloads on retry', async () => {
    listResolved.mockRejectedValueOnce(new Error('The request was aborted'));

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const alertEl = el.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('The request was aborted');
    const retryButton = alertEl?.querySelector('button');
    expect(retryButton).toBeTruthy();

    listResolved.mockResolvedValueOnce([
      makeResolvedArtifact({ artifact_id: 'DIR_001', name: 'Alpha' }),
    ]);
    retryButton?.dispatchEvent(new Event('click', { bubbles: true }));
    await settle(fixture);

    expect(listResolved).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toContain('Alpha');
  });

  it('renders a resolvable row as a routerLink to its per-type detail route (FR-002)', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({ artifact_id: 'DIR_001', name: 'Alpha', origin: 'own' }),
    ]);
    listByPackAndType.mockResolvedValue({
      items: [makeArtifact({ id: 'rec-1', artifact_type: 'directive', artifact_id: 'DIR_001' })],
      page: 1,
      perPage: 500,
      totalItems: 1,
      totalPages: 1,
    });

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('Alpha'));
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/packs/pack-1/directives/rec-1');
    expect(listByPackAndType).toHaveBeenCalledWith('pack-1', 'directive', {}, {
      perPage: 500,
      requestKey: 'artifact-table-record-ids:pack-1',
    });
  });

  it('renders an unresolvable row (e.g. built-in with no per-pack record) as plain text, not a broken link', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({ artifact_id: 'DIR_BUILTIN', name: 'Builtin One', origin: 'built-in' }),
    ]);
    listByPackAndType.mockResolvedValue({
      items: [],
      page: 1,
      perPage: 500,
      totalItems: 0,
      totalPages: 0,
    });

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Builtin One');
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Builtin One'),
    );
    expect(link).toBeUndefined();
  });

  it('renders rows immediately from listResolved without waiting on record-id resolution (does not block on record-id fetch)', async () => {
    let resolveRecordIds!: (value: { items: unknown[] }) => void;
    listResolved.mockResolvedValue([
      makeResolvedArtifact({ artifact_id: 'DIR_001', name: 'Alpha', origin: 'own' }),
    ]);
    listByPackAndType.mockReturnValue(
      new Promise((resolve) => {
        resolveRecordIds = resolve;
      }),
    );

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-loading-indicator')).toBeNull();
    expect(el.textContent).toContain('Alpha');

    resolveRecordIds({ items: [] });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('shows the In Charter badge and Add/Remove control per resolvable row, driven by the batch membership map (FR-007)', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({ artifact_id: 'DIR_001', name: 'Alpha', origin: 'own' }),
      makeResolvedArtifact({ artifact_id: 'DIR_002', name: 'Beta', origin: 'own' }),
    ]);
    listByPackAndType.mockResolvedValue({
      items: [
        makeArtifact({ id: 'rec-1', artifact_type: 'directive', artifact_id: 'DIR_001' }),
        makeArtifact({ id: 'rec-2', artifact_type: 'directive', artifact_id: 'DIR_002' }),
      ],
      page: 1,
      perPage: 500,
      totalItems: 2,
      totalPages: 1,
    });

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    fixture.componentRef.setInput(
      'membership',
      new Map([[membershipKey('directive', 'DIR_001'), charterItem({ id: 'item-1' })]]),
    );
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);

    expect(rows[0].querySelector('app-in-charter-badge')?.textContent).toContain('In Charter');
    expect(rows[0].querySelector('app-add-to-charter-control button')?.textContent).toContain(
      'Remove from Charter',
    );

    expect(rows[1].querySelector('app-in-charter-badge')?.textContent?.trim()).toBe('');
    expect(rows[1].querySelector('app-add-to-charter-control button')?.textContent).toContain(
      'Add to Charter',
    );

    // Batch mode never falls back to a per-row lookup (N+1 guard).
    expect(isInActiveCharter).not.toHaveBeenCalled();
  });

  it('omits the Add-to-Charter control (badge-only) for an unresolvable row with no pack_artifacts record', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({ artifact_id: 'DIR_BUILTIN', name: 'Builtin One', origin: 'built-in' }),
    ]);
    listByPackAndType.mockResolvedValue({
      items: [],
      page: 1,
      perPage: 500,
      totalItems: 0,
      totalPages: 0,
    });

    const fixture = TestBed.createComponent(PackArtifactTable);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('artifactType', 'directive');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const row = el.querySelector('tbody tr');
    expect(row?.querySelector('app-in-charter-badge')).toBeTruthy();
    expect(row?.querySelector('app-add-to-charter-control')).toBeNull();
  });
});
