import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ArtifactsReadService, CharterMembershipService } from '../data-access';
import { ActiveCharterStore } from '../../charters/shared';
import { PackArtifactTabs } from './pack-artifact-tabs';
import { makePack } from './test-fixtures';

describe('PackArtifactTabs (FR-018 / FR-019 / NFR-003)', () => {
  let listMembershipForPack: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listMembershipForPack = vi.fn().mockResolvedValue(new Map());

    await TestBed.configureTestingModule({
      imports: [PackArtifactTabs],
      providers: [
        provideSpartanHlm(),
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
            listMembershipForPack,
            isInActiveCharter: vi.fn().mockResolvedValue(null),
            add: vi.fn(),
            remove: vi.fn(),
          },
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

  it('renders typed triggers from stats and keeps Raw last with labeled tab list', () => {
    const fixture = TestBed.createComponent(PackArtifactTabs);
    fixture.componentRef.setInput(
      'pack',
      makePack({
        stats: { total: 3, by_type: { directive: 2, profile: 1, tactic: 0 } },
      }),
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const tabList = el.querySelector('[aria-label="Pack artifacts"]');
    expect(tabList).toBeTruthy();

    const triggers = Array.from(tabList!.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );
    expect(triggers).toEqual(['Profiles', 'Behavioural', 'Raw']);
    expect(triggers.at(-1)).toBe('Raw');
    expect(el.querySelector('hlm-tabs')).toBeTruthy();
  });

  it('activates the Behavioural tab into app-pack-behavioural-tab, not a raw artifact table', () => {
    const fixture = TestBed.createComponent(PackArtifactTabs);
    fixture.componentRef.setInput(
      'pack',
      makePack({
        stats: { total: 3, by_type: { directive: 2, profile: 1, tactic: 0 } },
      }),
    );
    fixture.detectChanges();

    fixture.componentInstance['onTabActivated']('behavioural');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const behaviouralTab = el.querySelector('app-pack-behavioural-tab');
    expect(behaviouralTab).toBeTruthy();
    // Any rendered app-pack-artifact-table must be nested inside the Behavioural
    // tab (its own stacked sections), not rendered directly as the tab content.
    const tables = Array.from(el.querySelectorAll('app-pack-artifact-table'));
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.every((table) => behaviouralTab!.contains(table))).toBe(true);
  });

  it('behaviouralTypesFor() filters out grouped types with a zero count', () => {
    const fixture = TestBed.createComponent(PackArtifactTabs);
    fixture.componentRef.setInput(
      'pack',
      makePack({
        stats: { total: 3, by_type: { directive: 2, styleguide: 1, tactic: 0, procedure: 0 } },
      }),
    );
    fixture.detectChanges();

    fixture.componentInstance['onTabActivated']('behavioural');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const sectionTables = el.querySelectorAll('app-pack-behavioural-tab app-pack-artifact-table');
    expect(sectionTables).toHaveLength(2);
  });

  it('loads charter membership once per pack view via listMembershipForPack (FR-007)', () => {
    const fixture = TestBed.createComponent(PackArtifactTabs);
    fixture.componentRef.setInput(
      'pack',
      makePack({
        stats: { total: 3, by_type: { directive: 2, profile: 1, tactic: 0 } },
      }),
    );
    fixture.detectChanges();

    expect(listMembershipForPack).toHaveBeenCalledTimes(1);
    expect(listMembershipForPack).toHaveBeenCalledWith('pack-1');
  });
});
