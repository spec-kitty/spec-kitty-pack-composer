import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';
import { provideRouter } from '@angular/router';

import { ArtifactsReadService } from '../data-access';
import type { ArtifactType } from '../models';
import { ArtifactDetailTabs } from './artifact-detail-tabs';
import {
  DIRECTIVE_CONTENT_FIXTURE,
  DIRECTIVE_CONTENT_FIXTURE_EMPTY,
  MISSION_STEP_CONTRACT_CONTENT_FIXTURE,
  PROCEDURE_CONTENT_FIXTURE,
  STYLEGUIDE_CONTENT_FIXTURE,
  TACTIC_CONTENT_FIXTURE,
  TOOLGUIDE_CONTENT_FIXTURE,
} from './content-fixtures';

const TYPE_TO_SELECTOR: Record<Exclude<ArtifactType, 'profile'>, string> = {
  directive: 'app-directive-content',
  tactic: 'app-tactic-content',
  procedure: 'app-procedure-content',
  styleguide: 'app-styleguide-content',
  toolguide: 'app-toolguide-content',
  mission_step_contract: 'app-mission-step-contract-content',
  template: 'app-markdown-content',
  glossary: 'app-markdown-content',
};

const TYPE_TO_CONTENT: Record<Exclude<ArtifactType, 'profile'>, unknown> = {
  directive: DIRECTIVE_CONTENT_FIXTURE,
  tactic: TACTIC_CONTENT_FIXTURE,
  procedure: PROCEDURE_CONTENT_FIXTURE,
  styleguide: STYLEGUIDE_CONTENT_FIXTURE,
  toolguide: TOOLGUIDE_CONTENT_FIXTURE,
  mission_step_contract: MISSION_STEP_CONTRACT_CONTENT_FIXTURE,
  template: { raw: '# Hello' },
  glossary: { raw: '# Hello' },
};

describe('ArtifactDetailTabs (FR-005, FR-014)', () => {
  let artifactsRead: { listByPackAndType: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    artifactsRead = { listByPackAndType: vi.fn().mockResolvedValue({ items: [] }) };

    await TestBed.configureTestingModule({
      imports: [ArtifactDetailTabs],
      providers: [
        provideSpartanHlm(),
        provideRouter([]),
        { provide: ArtifactsReadService, useValue: artifactsRead },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function activePanel(el: HTMLElement): HTMLElement | null {
    return el.querySelector('[role="tabpanel"]:not([hidden])');
  }

  function tabTriggers(el: HTMLElement): string[] {
    const tabList = el.querySelector('[aria-label="Artifact sections"]');
    return Array.from(tabList?.querySelectorAll('button') ?? []).map(
      (button) => button.textContent?.trim() ?? '',
    );
  }

  for (const [type, selector] of Object.entries(TYPE_TO_SELECTOR)) {
    const artifactType = type as Exclude<ArtifactType, 'profile'>;
    it(`dispatches '${type}' to ${selector} and never to another renderer`, () => {
      const fixture = TestBed.createComponent(ArtifactDetailTabs);
      fixture.componentRef.setInput('artifactType', artifactType);
      fixture.componentRef.setInput('content', TYPE_TO_CONTENT[artifactType]);
      fixture.componentRef.setInput('packId', 'pack-1');
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(activePanel(el)?.querySelector(selector)).toBeTruthy();

      for (const [otherType, otherSelector] of Object.entries(TYPE_TO_SELECTOR)) {
        if (otherSelector === selector) {
          continue;
        }
        void otherType;
        expect(activePanel(el)?.querySelector(otherSelector)).toBeFalsy();
      }
    });
  }

  it('omits the Details tab trigger entirely when content is empty (directive)', () => {
    const fixture = TestBed.createComponent(ArtifactDetailTabs);
    fixture.componentRef.setInput('artifactType', 'directive' satisfies ArtifactType);
    fixture.componentRef.setInput('content', DIRECTIVE_CONTENT_FIXTURE_EMPTY);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(tabTriggers(el)).toEqual(['Raw']);
    expect(activePanel(el)?.querySelector('app-artifact-raw-tab')).toBeTruthy();
  });

  it('omits the Details tab trigger entirely when content is empty (tactic)', () => {
    const fixture = TestBed.createComponent(ArtifactDetailTabs);
    fixture.componentRef.setInput('artifactType', 'tactic' satisfies ArtifactType);
    fixture.componentRef.setInput('content', {});
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(tabTriggers(el)).toEqual(['Raw']);
  });

  it('shows both Details and Raw triggers when content is present', () => {
    const fixture = TestBed.createComponent(ArtifactDetailTabs);
    fixture.componentRef.setInput('artifactType', 'directive' satisfies ArtifactType);
    fixture.componentRef.setInput('content', DIRECTIVE_CONTENT_FIXTURE);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(tabTriggers(el)).toEqual(['Details', 'Raw']);
  });

  it('Raw tab is always present and shows content regardless of hasDetails()', () => {
    const fixture = TestBed.createComponent(ArtifactDetailTabs);
    fixture.componentRef.setInput('artifactType', 'toolguide' satisfies ArtifactType);
    fixture.componentRef.setInput('content', {});
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const rawTrigger = Array.from(el.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Raw',
    );
    expect(rawTrigger).toBeTruthy();
    expect(activePanel(el)?.querySelector('app-artifact-raw-tab')).toBeTruthy();
  });

  it('mission_step_contract passes packId through to MissionStepContractContent', () => {
    const fixture = TestBed.createComponent(ArtifactDetailTabs);
    fixture.componentRef.setInput('artifactType', 'mission_step_contract' satisfies ArtifactType);
    fixture.componentRef.setInput('content', MISSION_STEP_CONTRACT_CONTENT_FIXTURE);
    fixture.componentRef.setInput('packId', 'pack-42');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const rendered = el.querySelector('app-mission-step-contract-content');
    expect(rendered).toBeTruthy();
    expect(artifactsRead.listByPackAndType).toHaveBeenCalledWith('pack-42', 'directive');
    expect(artifactsRead.listByPackAndType).toHaveBeenCalledWith('pack-42', 'tactic');
  });

  it('re-dispatches correctly when artifactType/content inputs change without recreating the component', () => {
    const fixture = TestBed.createComponent(ArtifactDetailTabs);
    fixture.componentRef.setInput('artifactType', 'directive' satisfies ArtifactType);
    fixture.componentRef.setInput('content', DIRECTIVE_CONTENT_FIXTURE);
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(activePanel(el)?.querySelector('app-directive-content')).toBeTruthy();

    expect(() => {
      fixture.componentRef.setInput('artifactType', 'template' satisfies ArtifactType);
      fixture.componentRef.setInput('content', { raw: '# New artifact' });
      fixture.componentRef.setInput('packId', 'pack-2');
      fixture.detectChanges();
    }).not.toThrow();

    expect(activePanel(el)?.querySelector('app-markdown-content')).toBeTruthy();
    expect(activePanel(el)?.querySelector('app-directive-content')).toBeFalsy();
  });
});
