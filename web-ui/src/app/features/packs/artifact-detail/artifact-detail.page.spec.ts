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
import { ArtifactDetailPage } from './artifact-detail.page';
import { DIRECTIVE_CONTENT_FIXTURE } from './content-fixtures';

describe('ArtifactDetailPage (FR-001, FR-003, FR-004, FR-015–FR-020)', () => {
  let packsRead: { get: ReturnType<typeof vi.fn> };
  let packsApi: { refreshPack: ReturnType<typeof vi.fn> };
  let artifactsRead: { get: ReturnType<typeof vi.fn>; listByPackAndType: ReturnType<typeof vi.fn> };
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  function configureTestBed(initialParams: Record<string, string>): void {
    paramMap$ = new BehaviorSubject(convertToParamMap(initialParams));

    TestBed.configureTestingModule({
      imports: [ArtifactDetailPage],
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
    artifactsRead = { get: vi.fn(), listByPackAndType: vi.fn().mockResolvedValue({ items: [] }) };
    configureTestBed({ id: 'pack-1', artifactId: 'art-1' });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
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

  it('shows loading on initial load then renders the composed page for a directive artifact', async () => {
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

    const fixture = TestBed.createComponent(ArtifactDetailPage);
    fixture.detectChanges();
    await flushEffects();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-loading-indicator')).toBeTruthy();
    expect(el.textContent).toContain('Loading artifact');

    resolvePack(makePack({ name: 'Acme Pack' }));
    resolveArtifact(
      makeArtifact({
        name: 'Version Governance',
        artifact_type: 'directive',
        content: DIRECTIVE_CONTENT_FIXTURE,
      }),
    );
    await waitFor(
      () => el.querySelector('h1')?.textContent?.includes('Version Governance') === true,
      fixture,
    );

    expect(el.querySelector('app-loading-indicator[aria-label="Loading artifact"]')).toBeNull();
    expect(el.textContent).not.toContain('Loading artifact');
    expect(el.querySelector('app-breadcrumb')).toBeTruthy();
    expect(el.querySelector('app-artifact-detail-header')).toBeTruthy();
    expect(el.querySelector('app-artifact-detail-tabs')).toBeTruthy();
    expect(el.querySelector('aside[aria-label="Artifact details sidebar"]')).toBeTruthy();
    expect(el.querySelector('app-artifact-detail-sidebar')).toBeTruthy();
  });

  it('shows the composed page for a template (shared markdown renderer) artifact', async () => {
    packsRead.get.mockResolvedValue(makePack({ name: 'Acme Pack' }));
    artifactsRead.get.mockResolvedValue(
      makeArtifact({
        name: 'Contribution Guide',
        artifact_type: 'template',
        content: { raw: '# Contribution Guide\n\nBe kind.' },
      }),
    );

    const fixture = TestBed.createComponent(ArtifactDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    expect(el.querySelector('app-artifact-detail-tabs')).toBeTruthy();
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Contribution Guide');
  });

  it('breadcrumb reads Packs / <pack name> / <artifact name> with correct links (FR-003)', async () => {
    packsRead.get.mockResolvedValue(makePack({ name: 'Acme Pack' }));
    artifactsRead.get.mockResolvedValue(makeArtifact({ name: 'Version Governance' }));

    const fixture = TestBed.createComponent(ArtifactDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    const links = Array.from(el.querySelectorAll('a[hlmBreadcrumbLink], a[href]')).map((a) =>
      a.textContent?.trim(),
    );
    expect(links).toContain('Packs');
    expect(links).toContain('Acme Pack');

    const current = el.querySelector('[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Version Governance');

    const crumb = el.querySelector('app-breadcrumb');
    expect(crumb?.textContent).toContain('Packs');
    expect(crumb?.textContent).toContain('Acme Pack');
    expect(crumb?.textContent).toContain('Version Governance');
  });

  it('Refresh calls refreshPack(packId) then reloads via artifactsRead.get(artifactId)', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockResolvedValue(makeArtifact());

    let resolveRefresh!: (value: unknown) => void;
    packsApi.refreshPack.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const fixture = TestBed.createComponent(ArtifactDetailPage);
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

  it('shows the parse-error banner when parse_ok is false, and Raw still renders (FR-018)', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockResolvedValue(
      makeArtifact({ parse_ok: false, parse_error: 'unexpected token', content: {} }),
    );

    const fixture = TestBed.createComponent(ArtifactDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('[role="alert"]') !== null, fixture);

    const banner = el.querySelector('[role="alert"]');
    expect(banner?.textContent).toContain('This artifact failed to parse.');
    expect(banner?.textContent).toContain('unexpected token');
    expect(el.querySelector('app-artifact-detail-tabs')).toBeTruthy();

    const rawTrigger = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Raw',
    );
    expect(rawTrigger).toBeTruthy();
  });

  it('shows an error state with a back link when the pack or artifact cannot be loaded', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockRejectedValue(new Error('Artifact not found'));

    const fixture = TestBed.createComponent(ArtifactDetailPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('[role="alert"]') !== null, fixture);

    expect(el.textContent).toContain('Artifact not found');
    const backLink = el.querySelector('a[href="/packs"]');
    expect(backLink).toBeTruthy();
    expect(el.querySelector('app-artifact-detail-header')).toBeNull();
  });

  it('loads correctly on a direct deep link with no prior navigation state (FR-017), directive type', async () => {
    configureTestBed({ id: 'pack-2', artifactId: 'art-2' });
    packsRead.get.mockResolvedValue(makePack({ id: 'pack-2', name: 'Deep Link Pack' }));
    artifactsRead.get.mockResolvedValue(
      makeArtifact({
        id: 'art-2',
        pack: 'pack-2',
        name: 'Deep Link Directive',
        artifact_type: 'directive',
        content: DIRECTIVE_CONTENT_FIXTURE,
      }),
    );

    const fixture = TestBed.createComponent(ArtifactDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    expect(packsRead.get).toHaveBeenCalledWith('pack-2');
    expect(artifactsRead.get).toHaveBeenCalledWith('art-2');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Deep Link Directive');
  });

  it('loads correctly on a direct deep link with no prior navigation state (FR-017), template type', async () => {
    configureTestBed({ id: 'pack-3', artifactId: 'art-3' });
    packsRead.get.mockResolvedValue(makePack({ id: 'pack-3', name: 'Deep Link Pack' }));
    artifactsRead.get.mockResolvedValue(
      makeArtifact({
        id: 'art-3',
        pack: 'pack-3',
        name: 'Deep Link Template',
        artifact_type: 'template',
        content: { raw: '# Deep link' },
      }),
    );

    const fixture = TestBed.createComponent(ArtifactDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    expect(packsRead.get).toHaveBeenCalledWith('pack-3');
    expect(artifactsRead.get).toHaveBeenCalledWith('art-3');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Deep Link Template');
  });

  it('is read-only: no form, textarea, or contenteditable content (FR-020)', async () => {
    packsRead.get.mockResolvedValue(makePack());
    artifactsRead.get.mockResolvedValue(makeArtifact());

    const fixture = TestBed.createComponent(ArtifactDetailPage);
    const el = fixture.nativeElement as HTMLElement;
    await waitFor(() => el.querySelector('h1') !== null, fixture);

    expect(el.querySelector('form, textarea, [contenteditable="true"]')).toBeNull();
  });
});
