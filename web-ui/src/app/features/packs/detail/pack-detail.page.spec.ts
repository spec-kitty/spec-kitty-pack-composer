import { TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter, ActivatedRoute } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';
import { BehaviorSubject } from 'rxjs';

import {
  ArtifactsReadService,
  CharterMembershipService,
  PacksApiService,
  PacksReadService,
} from '../data-access';
import { ActiveCharterStore } from '../../charters/shared';
import type { Pack, PackVersionHistory } from '../models';
import { PackDetailPage } from './pack-detail.page';
import { makePack, makeVersion } from './test-fixtures';

describe('PackDetailPage (FR-023 / FR-024 / C-001 / C-003)', () => {
  let packsRead: {
    get: ReturnType<typeof vi.fn>;
    listVersionHistory: ReturnType<typeof vi.fn>;
  };
  let packsApi: { refreshPack: ReturnType<typeof vi.fn>; getParentStatus: ReturnType<typeof vi.fn> };
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    packsRead = {
      get: vi.fn(),
      listVersionHistory: vi.fn(),
    };
    packsApi = {
      refreshPack: vi.fn(),
      getParentStatus: vi.fn().mockResolvedValue({}),
    };
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'pack-1' }));

    await TestBed.configureTestingModule({
      imports: [PackDetailPage],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: PacksReadService, useValue: packsRead },
        { provide: PacksApiService, useValue: packsApi },
        {
          provide: ArtifactsReadService,
          useValue: {
            listByPackAndType: vi.fn().mockResolvedValue({
              items: [],
              page: 1,
              perPage: 500,
              totalItems: 0,
              totalPages: 0,
            }),
            listResolved: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CharterMembershipService,
          useValue: {
            listMembershipForPack: vi.fn().mockResolvedValue(new Map()),
            isInActiveCharter: vi.fn().mockResolvedValue(null),
            add: vi.fn(),
            remove: vi.fn(),
          },
        },
        {
          provide: ActiveCharterStore,
          useValue: { activeCharterId: () => null, hasActiveCharter: () => false },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            snapshot: { paramMap: convertToParamMap({ id: 'pack-1' }) },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function flushEffects(): Promise<void> {
    // Allow Angular effect scheduling + promise microtasks to settle.
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

  it('shows loading on initial load then renders the pack (FR-024)', async () => {
    let resolveGet!: (pack: Pack) => void;
    let resolveVersions!: (versions: PackVersionHistory[]) => void;
    packsRead.get.mockReturnValue(
      new Promise<Pack>((resolve) => {
        resolveGet = resolve;
      }),
    );
    packsRead.listVersionHistory.mockReturnValue(
      new Promise<PackVersionHistory[]>((resolve) => {
        resolveVersions = resolve;
      }),
    );

    const fixture = TestBed.createComponent(PackDetailPage);
    fixture.detectChanges();
    await flushEffects();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-loading-indicator')).toBeTruthy();
    expect(el.textContent).toContain('Loading pack');

    resolveGet(makePack({ name: 'Loaded Pack' }));
    resolveVersions([makeVersion()]);
    await waitFor(() => el.querySelector('h1')?.textContent?.includes('Loaded Pack') === true, fixture);

    expect(el.querySelector('app-loading-indicator[aria-label="Loading pack"]')).toBeNull();
    expect(el.textContent).not.toContain('Loading pack');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Loaded Pack');
    expect(el.querySelector('app-pack-detail-header')).toBeTruthy();
    expect(el.querySelector('aside[aria-label="Pack details sidebar"]')).toBeTruthy();
    expect(el.textContent).not.toMatch(/People/i);
    expect(el.querySelector('form, input[type="password"]')).toBeNull();

    // Breadcrumb retrofit (FR-003): "Packs" links to the overview, pack name is current page.
    const breadcrumb = el.querySelector('app-breadcrumb');
    expect(breadcrumb).toBeTruthy();
    expect(breadcrumb?.textContent).toContain('Packs');
    expect(breadcrumb?.textContent).toContain('Loaded Pack');
    const packsLink = Array.from(breadcrumb!.querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'Packs',
    );
    expect(packsLink?.getAttribute('href')).toBe('/packs');
    const current = breadcrumb!.querySelector('[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Loaded Pack');
  });

  it('Refresh calls refreshPack then reloads detail and sets busy state (FR-023)', async () => {
    packsRead.get.mockResolvedValue(makePack());
    packsRead.listVersionHistory.mockResolvedValue([makeVersion()]);

    let resolveRefresh!: (value: unknown) => void;
    packsApi.refreshPack.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const fixture = TestBed.createComponent(PackDetailPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    packsRead.get.mockClear();
    packsRead.listVersionHistory.mockClear();

    const refreshButton = Array.from(el.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Refresh'),
    );
    expect(refreshButton).toBeTruthy();

    refreshButton!.click();
    fixture.detectChanges();
    await flushEffects();
    fixture.detectChanges();

    expect(packsApi.refreshPack).toHaveBeenCalledWith('pack-1');
    expect(refreshButton!.disabled).toBe(true);
    expect(refreshButton!.getAttribute('aria-busy')).toBe('true');
    expect(refreshButton!.textContent).toContain('Refreshing');

    resolveRefresh({
      id: 'pack-1',
      name: 'Acme Pack',
      origin: 'local',
      imported_at: '',
      updated_at: '',
    });
    await waitFor(() => refreshButton!.disabled === false, fixture);

    expect(packsRead.get).toHaveBeenCalledWith('pack-1');
    expect(packsRead.listVersionHistory).toHaveBeenCalledWith('pack-1');
    expect(refreshButton!.disabled).toBe(false);
  });
});
