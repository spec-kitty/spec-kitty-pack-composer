import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ArtifactsReadService } from '../data-access';
import type { ResolvedArtifact } from '../models';
import { PackProfilesTab } from './pack-profiles-tab';
import { makeArtifact, makeResolvedArtifact } from './test-fixtures';

describe('PackProfilesTab (FR-011 / FR-013 / FR-021 / NFR-003)', () => {
  let listResolved: ReturnType<typeof vi.fn>;
  let listByPackAndType: ReturnType<typeof vi.fn>;

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
    await TestBed.configureTestingModule({
      imports: [PackProfilesTab],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: ArtifactsReadService, useValue: { listResolved, listByPackAndType } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  /** `load()` chains further awaits (record-id lookups per source pack) — flush stability a few times. */
  async function settle(fixture: ReturnType<typeof TestBed.createComponent>): Promise<void> {
    fixture.detectChanges();
    for (let i = 0; i < 6; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  it('loads profiles sorted by name and filters by domain and role', async () => {
    const items: ResolvedArtifact[] = [
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_A',
        name: 'Alice',
        category: undefined,
        domain_keywords: ['finance'],
        roles: ['implementer'],
      }),
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_B',
        name: 'Bob',
        category: undefined,
        domain_keywords: ['platform'],
        roles: ['reviewer'],
      }),
    ];
    listResolved.mockResolvedValue(items);

    const fixture = TestBed.createComponent(PackProfilesTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    await settle(fixture);

    expect(listResolved).toHaveBeenCalledWith('pack-1');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('label[for="profile-search"]')?.textContent).toContain(
      'Search profiles',
    );
    expect(el.textContent).toContain('Alice');
    expect(el.textContent).toContain('Bob');
    expect(el.textContent).toContain('2 profiles');

    // Filters are collapsed behind trigger buttons until opened (saves space).
    const domainTrigger = el.querySelector<HTMLButtonElement>('[aria-label="Domain filter"]');
    expect(domainTrigger).toBeTruthy();
    expect(el.querySelector('[aria-label="finance filter"]')).toBeNull();

    domainTrigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Popover content renders into the CDK overlay container (document.body), not `el`.
    const domainItem = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[hlm-command-item]'),
    ).find((button) => button.textContent?.includes('finance'));
    expect(domainItem?.getAttribute('aria-pressed')).toBe('false');
    domainItem!.click();
    fixture.detectChanges();
    expect(domainItem?.getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('Alice');
    expect(el.textContent).not.toContain('Bob');
    expect(el.textContent).toContain('1 profile');

    domainItem!.click();
    fixture.detectChanges();

    const roleTrigger = el.querySelector<HTMLButtonElement>('[aria-label="Role filter"]');
    roleTrigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const roleItem = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[hlm-command-item]'),
    ).find((button) => button.textContent?.includes('reviewer'));
    roleItem!.click();
    fixture.detectChanges();
    expect(roleItem?.getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('Bob');
    expect(el.textContent).not.toContain('Alice');

    // Read-only (FR-025 / C-002).
    expect(el.querySelector('textarea, [contenteditable="true"], form')).toBeNull();
  });

  it('shows origin badges and narrows via the Origin filter (FR-011/FR-013)', async () => {
    const items: ResolvedArtifact[] = [
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_OWN',
        name: 'Own Profile',
        origin: 'own',
      }),
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_PARENT',
        name: 'Parent Profile',
        origin: 'parent',
        source_pack_name: 'Base Pack',
      }),
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_BUILTIN',
        name: 'Builtin Profile',
        origin: 'built-in',
      }),
    ];
    listResolved.mockResolvedValue(items);

    const fixture = TestBed.createComponent(PackProfilesTab);
    fixture.componentRef.setInput('packId', 'pack-1');
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

    const ownItem = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[hlm-command-item]'),
    ).find((button) => button.textContent?.trim() === 'Own');
    ownItem!.click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Own Profile');
    expect(el.textContent).not.toContain('Parent Profile');
    expect(el.textContent).not.toContain('Builtin Profile');
    expect(el.textContent).toContain('1 profile');
  });

  it('renders each resolved profile exactly once — no client-side re-duplication (FR-012)', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_SHARED',
        name: 'Shared Profile',
        origin: 'own',
      }),
    ]);

    const fixture = TestBed.createComponent(PackProfilesTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.textContent).toContain('1 profile');
  });

  it('links own profiles to the agent detail route via their PocketBase record id (FR-002)', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_A',
        name: 'Alice',
        origin: 'own',
        domain_keywords: ['finance'],
        roles: ['implementer'],
      }),
    ]);
    listByPackAndType.mockResolvedValue({
      items: [makeArtifact({ id: 'p1', artifact_type: 'profile', artifact_id: 'PROF_A', name: 'Alice' })],
      page: 1,
      perPage: 500,
      totalItems: 1,
      totalPages: 1,
    });

    const fixture = TestBed.createComponent(PackProfilesTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const link = Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.includes('Alice'));
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/packs/pack-1/agents/p1');
  });

  it('links inherited/built-in profiles to their source pack (own-pack record id)', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_PARENT',
        name: 'Parent Profile',
        origin: 'parent',
        source_pack_id: 'pack-base',
        source_pack_name: 'Base Pack',
      }),
    ]);
    listByPackAndType.mockImplementation((sourcePackId: string) =>
      Promise.resolve({
        items:
          sourcePackId === 'pack-base'
            ? [
                makeArtifact({
                  id: 'p-base-1',
                  artifact_type: 'profile',
                  artifact_id: 'PROF_PARENT',
                  name: 'Parent Profile',
                }),
              ]
            : [],
        page: 1,
        perPage: 500,
        totalItems: sourcePackId === 'pack-base' ? 1 : 0,
        totalPages: 1,
      }),
    );

    const fixture = TestBed.createComponent(PackProfilesTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Parent Profile'),
    );
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/packs/pack-base/agents/p-base-1');
    expect(listByPackAndType).toHaveBeenCalledWith('pack-1', 'profile', {}, {
      perPage: 500,
      requestKey: 'profiles-own-ids:pack-1',
    });
    expect(listByPackAndType).toHaveBeenCalledWith('pack-base', 'profile', {}, {
      perPage: 500,
      requestKey: 'profiles-own-ids:pack-base',
    });
  });

  it('does not link inherited/built-in profiles when their source pack id is unknown', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({
        artifact_type: 'profile',
        artifact_id: 'PROF_PARENT',
        name: 'Parent Profile',
        origin: 'parent',
        source_pack_id: undefined,
        source_pack_name: 'Base Pack',
      }),
    ]);

    const fixture = TestBed.createComponent(PackProfilesTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Parent Profile');
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Parent Profile'),
    );
    expect(link).toBeUndefined();
  });

  it('shows a retryable error state when the request is aborted, and reloads on retry', async () => {
    listResolved.mockRejectedValueOnce(new Error('The request was aborted'));

    const fixture = TestBed.createComponent(PackProfilesTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const alertEl = el.querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('The request was aborted');
    const retryButton = alertEl?.querySelector('button');
    expect(retryButton).toBeTruthy();

    listResolved.mockResolvedValueOnce([
      makeResolvedArtifact({ artifact_type: 'profile', artifact_id: 'PROF_A', name: 'Alice' }),
    ]);
    retryButton?.dispatchEvent(new Event('click', { bubbles: true }));
    await settle(fixture);

    expect(listResolved).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toContain('Alice');
  });
});
