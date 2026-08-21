import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ArtifactsReadService, CharterMembershipService, membershipKey } from '../data-access';
import type { CharterItem } from '../../charters/models';
import { ActiveCharterStore } from '../../charters/shared';
import { PackArtifactTable } from './pack-artifact-table';
import { PackBehaviouralTab } from './pack-behavioural-tab';
import { makeResolvedArtifact } from './test-fixtures';

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

describe('PackBehaviouralTab (FR-003 / FR-004 / FR-005 / FR-012 / NFR-001)', () => {
  let listResolved: ReturnType<typeof vi.fn>;
  let listByPackAndType: ReturnType<typeof vi.fn>;
  let isInActiveCharter: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listResolved = vi.fn().mockResolvedValue([]);
    listByPackAndType = vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      perPage: 500,
      totalItems: 0,
      totalPages: 0,
    });
    isInActiveCharter = vi.fn().mockResolvedValue(null);

    await TestBed.configureTestingModule({
      imports: [PackBehaviouralTab],
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
  });

  async function settle(fixture: ReturnType<typeof TestBed.createComponent>): Promise<void> {
    fixture.detectChanges();
    for (let i = 0; i < 6; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  it('renders one section per member type, in order, with per-type headings and roles', async () => {
    const fixture = TestBed.createComponent(PackBehaviouralTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('memberTypes', ['directive', 'styleguide']);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const container = el.querySelector('[role="group"][aria-label="Behavioural artifacts"]');
    expect(container).toBeTruthy();

    const sections = el.querySelectorAll('section');
    expect(sections).toHaveLength(2);

    const headings = Array.from(el.querySelectorAll('section h2')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Directives', 'Styleguides']);

    expect(el.querySelectorAll('app-pack-artifact-table')).toHaveLength(2);
  });

  it('renders zero sections with an empty member type list and no console errors', async () => {
    const errorSpy = vi.spyOn(console, 'error');
    const fixture = TestBed.createComponent(PackBehaviouralTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('memberTypes', []);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('section')).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('forwards the membership map unchanged to every stacked table', async () => {
    listResolved.mockResolvedValue([
      makeResolvedArtifact({ artifact_id: 'DIR_001', name: 'Alpha', origin: 'own' }),
    ]);
    listByPackAndType.mockResolvedValue({
      items: [{ id: 'rec-1', artifact_type: 'directive', artifact_id: 'DIR_001' }],
      page: 1,
      perPage: 500,
      totalItems: 1,
      totalPages: 1,
    });

    const membership = new Map([
      [membershipKey('directive', 'DIR_001'), charterItem({ id: 'item-1' })],
    ]);

    const fixture = TestBed.createComponent(PackBehaviouralTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('memberTypes', ['directive']);
    fixture.componentRef.setInput('membership', membership);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-in-charter-badge')?.textContent).toContain('In Charter');
    expect(isInActiveCharter).not.toHaveBeenCalled();
  });

  it('re-emits membershipChanged when a stacked table emits it', async () => {
    const fixture = TestBed.createComponent(PackBehaviouralTab);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.componentRef.setInput('memberTypes', ['directive']);
    await settle(fixture);

    let emitted = false;
    fixture.componentInstance.membershipChanged.subscribe(() => {
      emitted = true;
    });

    const tableDebugEl = fixture.debugElement.query(By.directive(PackArtifactTable));
    expect(tableDebugEl).toBeTruthy();
    (tableDebugEl.componentInstance as PackArtifactTable).membershipChanged.emit();

    expect(emitted).toBe(true);
  });
});
