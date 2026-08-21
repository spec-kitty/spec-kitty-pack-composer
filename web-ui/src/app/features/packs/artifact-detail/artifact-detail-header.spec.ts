import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { CharterMembershipService } from '../data-access';
import type { CharterItem } from '../../charters/models';
import { ActiveCharterStore } from '../../charters/shared';
import { makeArtifact } from '../detail/test-fixtures';
import { ArtifactDetailHeader } from './artifact-detail-header';

describe('ArtifactDetailHeader (FR-004 / FR-007 / NFR-002 / NFR-003)', () => {
  let isInActiveCharter: ReturnType<typeof vi.fn>;
  let hasActiveCharter: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isInActiveCharter = vi.fn().mockResolvedValue(null);
    hasActiveCharter = vi.fn().mockReturnValue(false);

    await TestBed.configureTestingModule({
      imports: [ArtifactDetailHeader],
      providers: [
        provideSpartanHlm(),
        {
          provide: CharterMembershipService,
          useValue: { isInActiveCharter, add: vi.fn(), remove: vi.fn() },
        },
        { provide: ActiveCharterStore, useValue: { activeCharterId: () => null, hasActiveCharter } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  /** Two buttons exist now (the charter control + Refresh) — find the Refresh one by text. */
  function refreshButton(fixture: { nativeElement: unknown }): HTMLButtonElement | undefined {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Refresh'));
  }

  it('renders the artifact name in an h1', () => {
    const fixture = TestBed.createComponent(ArtifactDetailHeader);
    fixture.componentRef.setInput('artifact', makeArtifact({ name: 'Header Artifact' }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Header Artifact');
  });

  it('renders no badge markup of any kind', () => {
    const fixture = TestBed.createComponent(ArtifactDetailHeader);
    fixture.componentRef.setInput(
      'artifact',
      makeArtifact({ roles: ['implementer'], domain_keywords: ['billing'] }),
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[hlmBadge]')).toBeNull();
    expect(el.textContent).not.toContain('implementer');
    expect(el.textContent).not.toContain('billing');
  });

  it('shows an enabled Refresh button with "Refresh" text by default', () => {
    const fixture = TestBed.createComponent(ArtifactDetailHeader);
    fixture.componentRef.setInput('artifact', makeArtifact());
    fixture.detectChanges();

    const button = refreshButton(fixture);
    expect(button?.textContent?.trim()).toContain('Refresh');
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-busy')).toBe('false');
  });

  it('disables Refresh and shows busy state while refreshing', () => {
    const fixture = TestBed.createComponent(ArtifactDetailHeader);
    fixture.componentRef.setInput('artifact', makeArtifact());
    fixture.componentRef.setInput('refreshing', true);
    fixture.detectChanges();

    const button = refreshButton(fixture);
    expect(button?.textContent).toContain('Refreshing…');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
  });

  it('emits refresh exactly once when the Refresh button is clicked', () => {
    const fixture = TestBed.createComponent(ArtifactDetailHeader);
    fixture.componentRef.setInput('artifact', makeArtifact());
    fixture.detectChanges();

    let emitted = 0;
    fixture.componentInstance.refresh.subscribe(() => {
      emitted += 1;
    });

    refreshButton(fixture)!.click();
    expect(emitted).toBe(1);
  });

  it('shows the In Charter badge and enabled Add/Remove control once an active charter is resolved (FR-007)', async () => {
    hasActiveCharter.mockReturnValue(true);
    isInActiveCharter.mockResolvedValue({
      id: 'item-1',
      charter: 'charter-1',
      pack_name: 'Acme Pack',
      artifact_type: 'directive',
      artifact_id: 'DIR_001',
      artifact_name: 'Alpha Directive',
      enabled: true,
    } satisfies CharterItem);

    const fixture = TestBed.createComponent(ArtifactDetailHeader);
    fixture.componentRef.setInput('artifact', makeArtifact());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-in-charter-badge')?.textContent).toContain('In Charter');
    const charterButton = Array.from(el.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Remove from Charter'),
    );
    expect(charterButton).toBeTruthy();
    expect(charterButton?.disabled).toBe(false);
  });

  it('disables the Add to Charter control with a non-color-only explanation when there is no active charter (FR-008/NFR-003)', async () => {
    const fixture = TestBed.createComponent(ArtifactDetailHeader);
    fixture.componentRef.setInput('artifact', makeArtifact());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const charterButton = Array.from(el.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Add to Charter'),
    );
    expect(charterButton?.disabled).toBe(true);
    expect(charterButton?.getAttribute('aria-label')).toContain(
      'Create or activate a charter before adding artifacts to it.',
    );
  });
});
