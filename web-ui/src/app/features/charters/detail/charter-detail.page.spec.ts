import { TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter, ActivatedRoute } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';
import { BehaviorSubject } from 'rxjs';

import { ChartersApiService, ChartersReadService } from '../data-access';
import type {
  Charter,
  CharterGrid as CharterGridModel,
  CharterGridCard as CharterGridCardModel,
  RelatedItemCandidate,
} from '../models';
import { CharterDetailPage } from './charter-detail.page';

vi.mock('@spartan-ng/brain/sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

function makeCharter(overrides: Partial<Charter> = {}): Charter {
  return {
    id: 'charter-1',
    name: 'Doctrine Charter',
    active: false,
    created: '2026-01-15T10:00:00.000Z',
    updated: '2026-02-20T10:00:00.000Z',
    ...overrides,
  };
}

function emptyGrid(): CharterGridModel {
  return {
    directive: [],
    tactic: [],
    procedure: [],
    styleguide: [],
    toolguide: [],
    profile: [],
    mission_step_contract: [],
    template: [],
    glossary: [],
  } as CharterGridModel;
}

function makeRelatedItem(overrides: Partial<RelatedItemCandidate> = {}): RelatedItemCandidate {
  return {
    pack_artifact_id: 'related-1',
    artifact_type: 'tactic',
    artifact_id: 'TACTIC_1',
    name: 'Related Tactic',
    pack_name: 'Doctrine Core',
    already_in_charter: false,
    ...overrides,
  };
}

function makeCard(overrides: Partial<CharterGridCardModel> = {}): CharterGridCardModel {
  return {
    artifact_type: 'directive',
    artifact_id: 'artifact-1',
    // Deliberately distinct from artifact_id — pack_artifact_id is the real
    // pack_artifacts record id, artifact_id is the denormalized content-identity string.
    pack_artifact_id: 'record-1',
    artifact_name: 'Sample Directive',
    pack_name: 'Doctrine Core',
    charter_item_id: 'item-1',
    in_charter: true,
    enabled: false,
    conflicting: false,
    missing_source: false,
    ...overrides,
  };
}

describe('CharterDetailPage (FR-013/FR-016/FR-022/FR-024)', () => {
  let chartersRead: { get: ReturnType<typeof vi.fn> };
  let chartersApi: {
    getGrid: ReturnType<typeof vi.fn>;
    toggleItem: ReturnType<typeof vi.fn>;
    addItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
    getRelatedItems: ReturnType<typeof vi.fn>;
    addItemsBulk: ReturnType<typeof vi.fn>;
    renameCharter: ReturnType<typeof vi.fn>;
    deleteCharter: ReturnType<typeof vi.fn>;
    exportCharter: ReturnType<typeof vi.fn>;
  };
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let downloads: Array<{ download: string; href: string }>;
  let createdObjectUrls: Blob[];
  let revokedUrls: string[];

  beforeEach(async () => {
    chartersRead = { get: vi.fn() };
    chartersApi = {
      getGrid: vi.fn(),
      toggleItem: vi.fn(),
      addItem: vi.fn(),
      removeItem: vi.fn(),
      // Default: no related items, so directive-card `onAdd` tests written before
      // FR-026 keep falling straight through to the single-add path unchanged.
      getRelatedItems: vi.fn().mockResolvedValue({
        target: { pack_artifact_id: '', artifact_type: 'directive', artifact_id: '', name: '' },
        related: [],
      }),
      addItemsBulk: vi.fn(),
      renameCharter: vi.fn(),
      deleteCharter: vi.fn(),
      exportCharter: vi.fn(),
    };
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'charter-1' }));

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
      imports: [CharterDetailPage],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: ChartersReadService, useValue: chartersRead },
        { provide: ChartersApiService, useValue: chartersApi },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            snapshot: { paramMap: convertToParamMap({ id: 'charter-1' }) },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    TestBed.resetTestingModule();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  async function flushEffects(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  async function waitFor(
    predicate: () => boolean,
    fixture: ReturnType<typeof TestBed.createComponent>,
    attempts = 40,
  ): Promise<void> {
    for (let i = 0; i < attempts; i += 1) {
      fixture.detectChanges();
      await flushEffects();
      if (predicate()) {
        return;
      }
    }
  }

  it('loads and renders charter name, active badge and grid (FR-013/FR-024)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter({ name: 'Loaded Charter', active: true }));
    chartersApi.getGrid.mockResolvedValue(
      Object.assign(emptyGrid(), { directive: [makeCard()] }),
    );

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Loaded Charter');
    expect(el.textContent).toContain('Active');
    expect(chartersRead.get).toHaveBeenCalledWith('charter-1');
    expect(chartersApi.getGrid).toHaveBeenCalledWith('charter-1');
    expect(el.querySelector('app-charter-grid')).toBeTruthy();

    const breadcrumb = el.querySelector('app-breadcrumb');
    expect(breadcrumb?.textContent).toContain('Charters');
    expect(breadcrumb?.textContent).toContain('Loaded Charter');
  });

  it('shows an empty state pointing to Packs when the grid has zero cards across all kinds (FR-016)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    chartersApi.getGrid.mockResolvedValue(emptyGrid());

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.textContent?.includes('No artifacts available') === true, fixture);

    expect(el.querySelector('app-charter-grid')).toBeNull();
    const packsLink = el.querySelector<HTMLAnchorElement>('a[href="/packs"]');
    expect(packsLink).toBeTruthy();
  });

  it('shows a retry banner when the grid fetch fails (FR-024)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    chartersApi.getGrid.mockRejectedValue(new Error('grid boom'));

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.textContent?.includes('Could not load the artifact grid') === true, fixture);

    expect(el.textContent).toContain('grid boom');
    const retryButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.textContent?.trim() === 'Retry',
    );
    expect(retryButton).toBeTruthy();
  });

  it('wires a card toggle to toggleItem then reloads the grid (T066)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({ charter_item_id: 'item-9', enabled: false });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.toggleItem.mockResolvedValue({ item: card, auto_disabled: [] });

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance;
    await (component as unknown as { onToggle: (e: unknown) => Promise<void> }).onToggle({
      card,
      enabled: true,
    });

    expect(chartersApi.toggleItem).toHaveBeenCalledWith('charter-1', 'item-9', true);
    expect(chartersApi.getGrid).toHaveBeenCalledTimes(2);
  });

  it('wires a card add to addItem using the card pack_artifact_id (not artifact_id) then reloads the grid (T066)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    // artifact_id and pack_artifact_id are deliberately different so this test would fail
    // if onAdd ever forwards the wrong field again.
    const card = makeCard({
      in_charter: false,
      charter_item_id: undefined,
      artifact_id: 'DIRECTIVE_CONTENT_KEY',
      pack_artifact_id: 'pa-7',
    });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.addItem.mockResolvedValue({});

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
    };
    await component.onAdd(card);

    expect(chartersApi.addItem).toHaveBeenCalledWith('charter-1', 'pa-7');
    expect(chartersApi.addItem).not.toHaveBeenCalledWith('charter-1', 'DIRECTIVE_CONTENT_KEY');
    expect(chartersApi.getGrid).toHaveBeenCalledTimes(2);
  });

  it('shows an error toast and does not call addItem when pack_artifact_id is missing', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({
      in_charter: false,
      charter_item_id: undefined,
      missing_source: true,
      pack_artifact_id: undefined,
    });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
    };
    await component.onAdd(card);
    fixture.detectChanges();

    expect(chartersApi.addItem).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Cannot add this artifact: its source pack artifact is missing.');
  });

  it('shows the button as a spinner (no layout-shifting label) while an add is in flight, then a success toast (T073)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({
      in_charter: false,
      charter_item_id: undefined,
      artifact_name: 'Sample Directive',
      pack_artifact_id: 'pa-7',
    });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    let resolveAdd!: (value: unknown) => void;
    chartersApi.addItem.mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)));

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
    };
    const pending = component.onAdd(card);
    fixture.detectChanges();

    // No page-level "Updating charter" label — the button itself goes into a
    // busy/spinner state, so nothing above the grid reflows.
    expect(el.textContent).not.toContain('Updating charter');
    const addButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.startsWith('Add Sample Directive'),
    );
    expect(addButton?.getAttribute('aria-busy')).toBe('true');
    expect(addButton?.disabled).toBe(true);

    resolveAdd({});
    await pending;
    fixture.detectChanges();

    expect(toast.success).toHaveBeenCalledWith('Sample Directive added to charter');
  });

  it('shows an error toast (not the page banner) when addItem fails (T073)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({
      in_charter: false,
      charter_item_id: undefined,
      pack_artifact_id: 'pa-7',
    });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.addItem.mockRejectedValue(new Error('add boom'));

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
    };
    await component.onAdd(card);
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledWith('add boom');
    expect(el.textContent).not.toContain('add boom');
  });

  it('adds a non-directive card directly without checking for related items (FR-026)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({
      artifact_type: 'tactic',
      in_charter: false,
      charter_item_id: undefined,
      pack_artifact_id: 'pa-tactic',
    });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { tactic: [card] }));
    chartersApi.addItem.mockResolvedValue({});

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
    };
    await component.onAdd(card);

    expect(chartersApi.getRelatedItems).not.toHaveBeenCalled();
    expect(chartersApi.addItem).toHaveBeenCalledWith('charter-1', 'pa-tactic');
  });

  it('adds a directive with zero related items directly, with no confirmation dialog (FR-026)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({ in_charter: false, charter_item_id: undefined, pack_artifact_id: 'pa-directive' });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.addItem.mockResolvedValue({});
    // beforeEach's default already resolves `related: []`, matching this scenario explicitly.

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
    };
    await component.onAdd(card);
    fixture.detectChanges();

    expect(chartersApi.getRelatedItems).toHaveBeenCalledWith('charter-1', 'pa-directive');
    expect(chartersApi.addItem).toHaveBeenCalledWith('charter-1', 'pa-directive');
    expect(el.textContent).not.toContain('Add related items?');
  });

  it('opens the confirmation dialog instead of adding immediately when a directive has related items (FR-026)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({
      in_charter: false,
      charter_item_id: undefined,
      artifact_name: 'Directive One',
      pack_artifact_id: 'pa-directive',
    });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    const related = [makeRelatedItem()];
    chartersApi.getRelatedItems.mockResolvedValue({
      target: { pack_artifact_id: 'pa-directive', artifact_type: 'directive', artifact_id: 'DIRECTIVE_1', name: 'Directive One' },
      related,
    });

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
    };
    await component.onAdd(card);
    fixture.detectChanges();

    expect(chartersApi.addItem).not.toHaveBeenCalled();
    // The dialog body is portaled to `document.body`, not `fixture.nativeElement`.
    expect(document.body.textContent).toContain('Add related items?');
    expect(document.body.textContent).toContain('Related Tactic');
  });

  it('confirming the related-items dialog bulk-adds the directive plus checked items and toasts a summary (FR-026)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({
      in_charter: false,
      charter_item_id: undefined,
      artifact_name: 'Directive One',
      pack_artifact_id: 'pa-directive',
    });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.getRelatedItems.mockResolvedValue({
      target: { pack_artifact_id: 'pa-directive', artifact_type: 'directive', artifact_id: 'DIRECTIVE_1', name: 'Directive One' },
      related: [makeRelatedItem({ pack_artifact_id: 'pa-tactic' })],
    });
    chartersApi.addItemsBulk.mockResolvedValue({
      items: [{ id: 'i1' }, { id: 'i2' }],
      added_count: 2,
      already_present_count: 0,
    });

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
      onRelatedConfirmed: (ids: string[]) => Promise<void>;
      relatedDialogOpen: () => boolean;
    };
    await component.onAdd(card);
    fixture.detectChanges();

    await component.onRelatedConfirmed(['pa-tactic']);
    fixture.detectChanges();

    expect(chartersApi.addItemsBulk).toHaveBeenCalledWith('charter-1', ['pa-directive', 'pa-tactic']);
    expect(toast.success).toHaveBeenCalledWith('Directive One and 1 related item added to charter');
    expect(component.relatedDialogOpen()).toBe(false);
  });

  it('cancelling the related-items dialog adds nothing at all, including the directive (FR-026)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({
      in_charter: false,
      charter_item_id: undefined,
      pack_artifact_id: 'pa-directive',
    });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.getRelatedItems.mockResolvedValue({
      target: { pack_artifact_id: 'pa-directive', artifact_type: 'directive', artifact_id: 'DIRECTIVE_1', name: 'Directive One' },
      related: [makeRelatedItem()],
    });

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onAdd: (card: CharterGridCardModel) => Promise<void>;
      onRelatedCancelled: () => void;
      relatedDialogOpen: () => boolean;
    };
    await component.onAdd(card);
    fixture.detectChanges();

    component.onRelatedCancelled();
    fixture.detectChanges();

    expect(chartersApi.addItem).not.toHaveBeenCalled();
    expect(chartersApi.addItemsBulk).not.toHaveBeenCalled();
    expect(component.relatedDialogOpen()).toBe(false);
  });

  it('keeps the grid mounted (no skeleton teardown) while a toggle refetches the grid', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({ charter_item_id: 'item-9', enabled: false });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    // Make the toggle + refetch controllable so we can assert mid-flight DOM state.
    let resolveToggle!: (value: { item: unknown; auto_disabled: unknown[] }) => void;
    chartersApi.toggleItem.mockReturnValue(new Promise((resolve) => (resolveToggle = resolve)));
    let resolveGrid!: (value: CharterGridModel) => void;
    chartersApi.getGrid.mockReturnValue(new Promise((resolve) => (resolveGrid = resolve)));

    const component = fixture.componentInstance as unknown as {
      onToggle: (e: { card: CharterGridCardModel; enabled: boolean }) => Promise<void>;
    };
    const pending = component.onToggle({ card, enabled: true });
    fixture.detectChanges();

    // The scoped action-loading indicator shows, but the grid itself is never
    // torn down for a skeleton — this is what makes the update feel smooth
    // instead of like a full-page refresh.
    expect(el.textContent).toContain('Updating charter');
    expect(el.querySelector('app-charter-grid')).toBeTruthy();

    resolveToggle({ item: card, auto_disabled: [] });
    await flushEffects();
    fixture.detectChanges();
    expect(el.querySelector('app-charter-grid')).toBeTruthy();
    expect(el.textContent).not.toContain('Loading grid');

    resolveGrid(Object.assign(emptyGrid(), { directive: [{ ...card, enabled: true }] }));
    await pending;
    fixture.detectChanges();

    expect(el.querySelector('app-charter-grid')).toBeTruthy();
  });

  it('wires resolveConflict to toggleItem with enabled true then reloads the grid (T066)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({ conflicting: true, enabled: false, charter_item_id: 'item-conflict' });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.toggleItem.mockResolvedValue({ item: card, auto_disabled: [] });

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onResolveConflict: (card: CharterGridCardModel) => Promise<void>;
    };
    await component.onResolveConflict(card);

    expect(chartersApi.toggleItem).toHaveBeenCalledWith('charter-1', 'item-conflict', true);
    expect(chartersApi.getGrid).toHaveBeenCalledTimes(2);
  });

  it('opens a confirmation dialog when a card requests removal, without calling removeItem yet', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({ artifact_name: 'Sample Directive', charter_item_id: 'item-1' });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onRemoveRequest: (card: CharterGridCardModel) => void;
    };
    component.onRemoveRequest(card);
    fixture.detectChanges();

    expect(chartersApi.removeItem).not.toHaveBeenCalled();
    // The dialog body is portaled to `document.body`, not `fixture.nativeElement`.
    expect(document.body.textContent).toContain('Remove from charter');
    expect(document.body.textContent).toContain('Sample Directive');
  });

  it('removes an item via removeItem then reloads the grid and toasts success when confirmed', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({ artifact_name: 'Sample Directive', charter_item_id: 'item-1' });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.removeItem.mockResolvedValue(undefined);

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onRemoveRequest: (card: CharterGridCardModel) => void;
      onRemoveConfirmed: (result: { confirmed: boolean; toggleValue: boolean }) => Promise<void>;
    };
    component.onRemoveRequest(card);
    fixture.detectChanges();

    await component.onRemoveConfirmed({ confirmed: true, toggleValue: false });

    expect(chartersApi.removeItem).toHaveBeenCalledWith('charter-1', 'item-1');
    expect(chartersApi.getGrid).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith('Sample Directive removed from charter');
  });

  it('does not call removeItem when the removal is cancelled', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({ artifact_name: 'Sample Directive', charter_item_id: 'item-1' });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onRemoveRequest: (card: CharterGridCardModel) => void;
      onRemoveCancelled: () => void;
    };
    component.onRemoveRequest(card);
    fixture.detectChanges();

    component.onRemoveCancelled();
    fixture.detectChanges();

    expect(chartersApi.removeItem).not.toHaveBeenCalled();
  });

  it('shows an error toast (not the page banner) when removeItem fails', async () => {
    chartersRead.get.mockResolvedValue(makeCharter());
    const card = makeCard({ artifact_name: 'Sample Directive', charter_item_id: 'item-1' });
    chartersApi.getGrid.mockResolvedValue(Object.assign(emptyGrid(), { directive: [card] }));
    chartersApi.removeItem.mockRejectedValue(new Error('remove boom'));

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('app-charter-grid') !== null, fixture);

    const component = fixture.componentInstance as unknown as {
      onRemoveRequest: (card: CharterGridCardModel) => void;
      onRemoveConfirmed: (result: { confirmed: boolean; toggleValue: boolean }) => Promise<void>;
    };
    component.onRemoveRequest(card);
    fixture.detectChanges();

    await component.onRemoveConfirmed({ confirmed: true, toggleValue: false });
    fixture.detectChanges();

    expect(toast.error).toHaveBeenCalledWith('remove boom');
    expect(el.textContent).not.toContain('remove boom');
  });

  function clickButtonByText(fixture: ReturnType<typeof TestBed.createComponent>, text: string): void {
    const el = fixture.nativeElement as HTMLElement;
    const button = Array.from(el.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    expect(button, `no button labelled “${text}”`).toBeTruthy();
    button!.click();
  }

  it('downloads the exported ZIP when the Export button is clicked (T072)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter({ name: 'Doctrine Charter' }));
    chartersApi.getGrid.mockResolvedValue(emptyGrid());

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    const blob = new Blob(['zip-bytes'], { type: 'application/zip' });
    chartersApi.exportCharter.mockResolvedValue({
      blob,
      filename: 'doctrine-charter.zip',
      validationStatus: 'valid',
      validationErrors: null,
    });

    clickButtonByText(fixture, 'Export');
    await waitFor(() => downloads.length > 0, fixture);

    expect(chartersApi.exportCharter).toHaveBeenCalledWith('charter-1');
    expect(createdObjectUrls).toEqual([blob]);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].download).toBe('doctrine-charter.zip');
    expect(revokedUrls).toHaveLength(1);
    expect(el.textContent).not.toContain('validation errors');
  });

  it('still downloads the ZIP but shows an error banner when validation reports errors (T072)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter({ name: 'Doctrine Charter' }));
    chartersApi.getGrid.mockResolvedValue(emptyGrid());

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    chartersApi.exportCharter.mockResolvedValue({
      blob: new Blob(['zip-bytes'], { type: 'application/zip' }),
      filename: null,
      validationStatus: 'errors',
      validationErrors: [{ message: 'item references a missing artifact' }],
    });

    clickButtonByText(fixture, 'Export');
    await waitFor(() => el.textContent?.includes('item references a missing artifact') === true, fixture);

    expect(downloads).toHaveLength(1);
    expect(el.textContent).toContain('item references a missing artifact');
  });

  it('reports export failures without downloading anything (T072)', async () => {
    chartersRead.get.mockResolvedValue(makeCharter({ name: 'Doctrine Charter' }));
    chartersApi.getGrid.mockResolvedValue(emptyGrid());

    const fixture = TestBed.createComponent(CharterDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    chartersApi.exportCharter.mockRejectedValue(new Error('Charter has no enabled items'));

    clickButtonByText(fixture, 'Export');
    await waitFor(() => el.textContent?.includes('Charter has no enabled items') === true, fixture);

    expect(downloads).toHaveLength(0);
    expect(el.textContent).toContain('Charter has no enabled items');
  });
});
