import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { CharterMembershipService } from '../data-access';
import type { CharterItem } from '../../charters/models';
import { ActiveCharterStore } from '../../charters/shared';
import { makeArtifact } from '../detail/test-fixtures';
import { AgentDetailHeader } from './agent-detail-header';

describe('AgentDetailHeader (FR-004 / FR-005 / FR-006 / FR-007 / NFR-002)', () => {
  let isInActiveCharter: ReturnType<typeof vi.fn>;
  let hasActiveCharter: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isInActiveCharter = vi.fn().mockResolvedValue(null);
    hasActiveCharter = vi.fn().mockReturnValue(false);

    await TestBed.configureTestingModule({
      imports: [AgentDetailHeader],
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

  it('renders the profile name in an h1', () => {
    const fixture = TestBed.createComponent(AgentDetailHeader);
    fixture.componentRef.setInput('profile', makeArtifact({ name: 'Header Profile' }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Header Profile');
  });

  it('renders domain keywords and roles as two documented badge rows', () => {
    const fixture = TestBed.createComponent(AgentDetailHeader);
    fixture.componentRef.setInput(
      'profile',
      makeArtifact({
        domain_keywords: ['software', 'hardware'],
        roles: ['implementer', 'reviewer'],
      }),
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const domainRow = el.querySelector('[aria-label="Domain keywords"]');
    const rolesRow = el.querySelector('[aria-label="Roles"]');

    expect(domainRow?.textContent).toContain('software');
    expect(domainRow?.textContent).toContain('hardware');
    expect(rolesRow?.textContent).toContain('implementer');
    expect(rolesRow?.textContent).toContain('reviewer');
  });

  it('omits the domain-keywords row entirely when domain_keywords is undefined/empty', () => {
    const fixture = TestBed.createComponent(AgentDetailHeader);
    fixture.componentRef.setInput('profile', makeArtifact({ domain_keywords: undefined }));
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Domain keywords"]')).toBeNull();

    fixture.componentRef.setInput('profile', makeArtifact({ domain_keywords: [] }));
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Domain keywords"]')).toBeNull();
  });

  it('omits the roles row entirely when roles is undefined/empty', () => {
    const fixture = TestBed.createComponent(AgentDetailHeader);
    fixture.componentRef.setInput('profile', makeArtifact({ roles: undefined }));
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Roles"]')).toBeNull();

    fixture.componentRef.setInput('profile', makeArtifact({ roles: [] }));
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label="Roles"]')).toBeNull();
  });

  it('disables Refresh and shows busy state while refreshing', () => {
    const fixture = TestBed.createComponent(AgentDetailHeader);
    fixture.componentRef.setInput('profile', makeArtifact());
    fixture.componentRef.setInput('refreshing', true);
    fixture.detectChanges();

    const refresh = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Refreshing'));
    expect(refresh).toBeTruthy();
    expect(refresh!.disabled).toBe(true);
    expect(refresh!.getAttribute('aria-busy')).toBe('true');
  });

  it('emits refresh exactly once when the Refresh button is clicked', () => {
    const fixture = TestBed.createComponent(AgentDetailHeader);
    fixture.componentRef.setInput('profile', makeArtifact());
    fixture.detectChanges();

    let emitted = 0;
    fixture.componentInstance.refresh.subscribe(() => {
      emitted += 1;
    });

    const refresh = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Refresh'));
    refresh!.click();
    expect(emitted).toBe(1);
  });

  it('shows the In Charter badge and enabled Remove control once an active charter membership resolves (FR-007)', async () => {
    hasActiveCharter.mockReturnValue(true);
    isInActiveCharter.mockResolvedValue({
      id: 'item-1',
      charter: 'charter-1',
      pack_name: 'Acme Pack',
      artifact_type: 'profile',
      artifact_id: 'PROF_001',
      artifact_name: 'Alpha Profile',
      enabled: true,
    } satisfies CharterItem);

    const fixture = TestBed.createComponent(AgentDetailHeader);
    fixture.componentRef.setInput('profile', makeArtifact({ artifact_type: 'profile', artifact_id: 'PROF_001' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-in-charter-badge')?.textContent).toContain('In Charter');
    const charterButton = Array.from(el.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Remove from Charter'),
    );
    expect(charterButton?.disabled).toBe(false);
  });

  it('disables the Add to Charter control with a non-color-only explanation when there is no active charter (FR-008/NFR-003)', async () => {
    const fixture = TestBed.createComponent(AgentDetailHeader);
    fixture.componentRef.setInput('profile', makeArtifact());
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
