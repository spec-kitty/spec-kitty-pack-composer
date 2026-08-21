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
import { makeArtifact, makePack } from '../detail/test-fixtures';
import type { Pack, PackArtifact } from '../models';
import { AgentDetailPage } from './agent-detail.page';

describe('AgentDetailPage (FR-001, FR-004–FR-007, FR-010–FR-015)', () => {
  let packsRead: { get: ReturnType<typeof vi.fn> };
  let packsApi: { refreshPack: ReturnType<typeof vi.fn> };
  let artifactsRead: { get: ReturnType<typeof vi.fn> };
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function configureTestBed(initialParams: Record<string, string>): void {
    paramMap$ = new BehaviorSubject(convertToParamMap(initialParams));

    TestBed.configureTestingModule({
      imports: [AgentDetailPage],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: PacksReadService, useValue: packsRead },
        { provide: PacksApiService, useValue: packsApi },
        { provide: ArtifactsReadService, useValue: artifactsRead },
        {
          provide: CharterMembershipService,
          useValue: {
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
            snapshot: { paramMap: convertToParamMap(initialParams) },
          },
        },
      ],
    });
  }

  beforeEach(() => {
    packsRead = { get: vi.fn() };
    packsApi = { refreshPack: vi.fn() };
    artifactsRead = { get: vi.fn() };
    configureTestBed({ id: 'pack-1', profileId: 'art-1' });
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

  it('shows loading on initial load then renders the composed page (FR-014)', async () => {
    let resolvePack!: (pack: Pack) => void;
    let resolveArtifact!: (artifact: PackArtifact) => void;
    packsRead.get.mockReturnValue(
      new Promise<Pack>((resolve) => {
        resolvePack = resolve;
      }),
    );
    artifactsRead.get.mockReturnValue(
      new Promise<PackArtifact>((resolve) => {
        resolveArtifact = resolve;
      }),
    );

    const fixture = TestBed.createComponent(AgentDetailPage);
    fixture.detectChanges();
    await flushEffects();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-loading-indicator')).toBeTruthy();
    expect(el.textContent).toContain('Loading profile');

    resolvePack(makePack({ name: 'Acme Pack' }));
    resolveArtifact(makeArtifact({ name: 'Alpha Profile', artifact_type: 'profile' }));
    await waitFor(
      () => el.querySelector('h1')?.textContent?.includes('Alpha Profile') === true,
      fixture,
    );

    expect(el.querySelector('app-loading-indicator[aria-label="Loading profile"]')).toBeNull();
    expect(el.textContent).not.toContain('Loading profile');
    expect(el.querySelector('app-breadcrumb')).toBeTruthy();
    expect(el.querySelector('app-agent-detail-header')).toBeTruthy();
    expect(el.querySelector('app-agent-section-tabs')).toBeTruthy();
    expect(el.querySelector('aside[aria-label="Profile details sidebar"]')).toBeTruthy();
    expect(el.querySelector('app-agent-detail-sidebar')).toBeTruthy();
  });

  it('breadcrumb reads Packs / <pack name> / <profile name> with correct links (FR-003)', async () => {
    packsRead.get.mockResolvedValue(makePack({ name: 'Acme Pack' }));
    artifactsRead.get.mockResolvedValue(makeArtifact({ name: 'Alpha Profile' }));

    const fixture = TestBed.createComponent(AgentDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    const links = Array.from(el.querySelectorAll('a[hlmBreadcrumbLink], a[href]')).map((a) =>
      a.textContent?.trim(),
    );
    expect(links).toContain('Packs');
    expect(links).toContain('Acme Pack');

    const current = el.querySelector('[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Alpha Profile');

    const crumb = el.querySelector('app-breadcrumb');
    expect(crumb?.textContent).toContain('Packs');
    expect(crumb?.textContent).toContain('Acme Pack');
    expect(crumb?.textContent).toContain('Alpha Profile');
  });

  it('renders Description then Purpose then section tabs in order (FR-007)', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockResolvedValue(
      makeArtifact({
        content: { description: 'The description text.', purpose: 'The purpose text.' },
      }),
    );

    const fixture = TestBed.createComponent(AgentDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    const sections = Array.from(
      el.querySelectorAll('app-agent-detail-text-section, app-agent-section-tabs'),
    );
    expect(sections.length).toBe(3);

    const descriptionIndex = sections.findIndex((s) => s.textContent?.includes('description text'));
    const purposeIndex = sections.findIndex((s) => s.textContent?.includes('purpose text'));
    const tabsIndex = sections.findIndex(
      (s) => s.tagName.toLowerCase() === 'app-agent-section-tabs',
    );

    expect(descriptionIndex).toBeGreaterThanOrEqual(0);
    expect(purposeIndex).toBeGreaterThan(descriptionIndex);
    expect(tabsIndex).toBeGreaterThan(purposeIndex);
  });

  it('Refresh calls refreshPack(packId) then reloads both pack and profile (FR-010)', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockResolvedValue(makeArtifact());

    let resolveRefresh!: (value: unknown) => void;
    packsApi.refreshPack.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const fixture = TestBed.createComponent(AgentDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    packsRead.get.mockClear();
    artifactsRead.get.mockClear();

    const refreshButton = Array.from(el.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Refresh'),
    );
    expect(refreshButton).toBeTruthy();

    refreshButton!.click();
    fixture.detectChanges();
    await flushEffects();
    fixture.detectChanges();

    expect(packsApi.refreshPack).toHaveBeenCalledWith('pack-1');
    expect(packsApi.refreshPack).not.toHaveBeenCalledWith('art-1');
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
    expect(artifactsRead.get).toHaveBeenCalledWith('art-1');
    expect(refreshButton!.disabled).toBe(false);
  });

  it('shows the parse-error banner when parse_ok is false (FR-013)', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockResolvedValue(
      makeArtifact({ parse_ok: false, parse_error: 'unexpected token' }),
    );

    const fixture = TestBed.createComponent(AgentDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('[role="alert"]') !== null, fixture);

    const banner = el.querySelector('[role="alert"]');
    expect(banner?.textContent).toContain('This profile failed to parse.');
    expect(banner?.textContent).toContain('unexpected token');
    expect(el.querySelector('app-agent-section-tabs')).toBeTruthy();
  });

  it('shows an error state with a back link when the pack or profile cannot be loaded', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockRejectedValue(new Error('Profile not found'));

    const fixture = TestBed.createComponent(AgentDetailPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('[role="alert"]') !== null, fixture);

    expect(el.textContent).toContain('Profile not found');
    const backLink = el.querySelector('a[href="/packs"]');
    expect(backLink).toBeTruthy();
    expect(el.querySelector('app-agent-detail-header')).toBeNull();
  });

  it('loads correctly on a direct deep link with no prior navigation state (FR-012)', async () => {
    configureTestBed({ id: 'pack-2', profileId: 'art-2' });
    packsRead.get.mockResolvedValue(makePack({ id: 'pack-2', name: 'Deep Link Pack' }));
    artifactsRead.get.mockResolvedValue(
      makeArtifact({ id: 'art-2', pack: 'pack-2', name: 'Deep Link Profile' }),
    );

    const fixture = TestBed.createComponent(AgentDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    expect(packsRead.get).toHaveBeenCalledWith('pack-2');
    expect(artifactsRead.get).toHaveBeenCalledWith('art-2');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Deep Link Profile');
  });

  it('is read-only: no form, textarea, or contenteditable content (FR-015)', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockResolvedValue(makeArtifact());

    const fixture = TestBed.createComponent(AgentDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    expect(el.querySelector('form, textarea, [contenteditable="true"]')).toBeNull();
  });
});
