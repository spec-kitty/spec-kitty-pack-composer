import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ArtifactsReadService } from '../data-access';
import { makeArtifact } from '../detail/test-fixtures';
import { MISSION_STEP_CONTRACT_CONTENT_FIXTURE } from './content-fixtures';
import { MissionStepContractContent } from './mission-step-contract-content';

function emptyListResult() {
  return { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 0 };
}

describe('MissionStepContractContent (FR-011 / FR-012 / C-004)', () => {
  let listByPackAndType: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listByPackAndType = vi.fn().mockResolvedValue(emptyListResult());
    await TestBed.configureTestingModule({
      imports: [MissionStepContractContent],
      providers: [
        provideRouter([]),
        provideSpartanHlm(),
        { provide: ArtifactsReadService, useValue: { listByPackAndType } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function settle(fixture: ReturnType<typeof TestBed.createComponent>): Promise<void> {
    fixture.detectChanges();
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function createFixture(content: unknown, packId = 'pack-1') {
    const fixture = TestBed.createComponent(MissionStepContractContent);
    fixture.componentRef.setInput('content', content);
    fixture.componentRef.setInput('packId', packId);
    return fixture;
  }

  it('renders action, mission, ordered steps, command, and inputs from the fixture', async () => {
    const fixture = createFixture(MISSION_STEP_CONTRACT_CONTENT_FIXTURE);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('specify');
    expect(el.textContent).toContain('software-dev');

    const stepIds = Array.from(el.querySelectorAll('ol > li > span.font-mono')).map((n) =>
      n.textContent?.trim(),
    );
    expect(stepIds).toEqual(['bootstrap', 'select_model', 'write_spec']);

    expect(el.querySelector('code')?.textContent).toContain(
      'spec-kitty charter context --action specify --role specify --json',
    );
    expect(el.textContent).toContain('--profile');
    expect(el.textContent).toContain('wp.agent_profile');
    expect(el.textContent).toContain('optional');
  });

  it('renders a resolvable directive candidate as a routerLink to its own pack detail page', async () => {
    listByPackAndType.mockImplementation((packId: string, artifactType: string) => {
      if (artifactType === 'directive') {
        return Promise.resolve({
          items: [
            makeArtifact({
              id: 'rec-directive-1',
              artifact_type: 'directive',
              artifact_id: '042-model-discipline',
            }),
          ],
          page: 1,
          perPage: 200,
          totalItems: 1,
          totalPages: 1,
        });
      }
      return Promise.resolve(emptyListResult());
    });

    const fixture = createFixture(MISSION_STEP_CONTRACT_CONTENT_FIXTURE, 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('042-model-discipline'),
    );
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/packs/pack-1/directives/rec-directive-1');
  });

  it('renders a candidate with no match in either kind as plain text/badge, never a link', async () => {
    const fixture = createFixture(MISSION_STEP_CONTRACT_CONTENT_FIXTURE, 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const badge = Array.from(el.querySelectorAll('[hlmbadge], [hlmBadge]')).find((s) =>
      s.textContent?.includes('042-model-discipline'),
    );
    expect(badge).toBeTruthy();
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('042-model-discipline'),
    );
    expect(link).toBeUndefined();
  });

  it('fires exactly one listByPackAndType(directive) and one listByPackAndType(tactic) call regardless of candidate count', async () => {
    const fixture = createFixture(MISSION_STEP_CONTRACT_CONTENT_FIXTURE, 'pack-1');
    await settle(fixture);

    const directiveCalls = listByPackAndType.mock.calls.filter(
      (call: unknown[]) => call[1] === 'directive',
    );
    const tacticCalls = listByPackAndType.mock.calls.filter(
      (call: unknown[]) => call[1] === 'tactic',
    );
    expect(directiveCalls.length).toBe(1);
    expect(tacticCalls.length).toBe(1);
    expect(directiveCalls[0][0]).toBe('pack-1');
    expect(tacticCalls[0][0]).toBe('pack-1');
  });

  it('never attempts resolution and always renders plain text for a non-directive/tactic delegates_to.kind', async () => {
    const content = {
      action: 'specify',
      mission: 'software-dev',
      steps: [
        {
          id: 'procedural_step',
          description: "Delegates to a procedure, out of this component's resolution scope.",
          delegates_to: { kind: 'procedure', candidates: ['some-procedure-id'] },
        },
      ],
    };
    listByPackAndType.mockImplementation((packId: string, artifactType: string) => {
      if (artifactType === 'directive' || artifactType === 'tactic') {
        return Promise.resolve({
          items: [
            makeArtifact({
              id: 'rec-1',
              artifact_type: artifactType as 'directive' | 'tactic',
              artifact_id: 'some-procedure-id',
            }),
          ],
          page: 1,
          perPage: 200,
          totalItems: 1,
          totalPages: 1,
        });
      }
      return Promise.resolve(emptyListResult());
    });

    const fixture = createFixture(content, 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('some-procedure-id'),
    );
    expect(link).toBeUndefined();
    const badge = Array.from(el.querySelectorAll('[hlmbadge], [hlmBadge]')).find((s) =>
      s.textContent?.includes('some-procedure-id'),
    );
    expect(badge).toBeTruthy();
    // Only 'directive'/'tactic' calls were made — never for 'procedure'.
    const procedureCalls = listByPackAndType.mock.calls.filter(
      (call: unknown[]) => call[1] === 'procedure',
    );
    expect(procedureCalls.length).toBe(0);
  });

  it('resolves the other kind normally and does not crash when one kind rejects', async () => {
    listByPackAndType.mockImplementation((packId: string, artifactType: string) => {
      if (artifactType === 'directive') {
        return Promise.reject(new Error('network error'));
      }
      if (artifactType === 'tactic') {
        return Promise.resolve({
          items: [
            makeArtifact({
              id: 'rec-tactic-1',
              artifact_type: 'tactic',
              artifact_id: '042-model-discipline',
            }),
          ],
          page: 1,
          perPage: 200,
          totalItems: 1,
          totalPages: 1,
        });
      }
      return Promise.resolve(emptyListResult());
    });

    // Override the fixture's step to delegate to 'tactic' instead of 'directive'
    // so the surviving (resolved) kind is exercised end-to-end.
    const content = {
      action: 'specify',
      mission: 'software-dev',
      steps: [
        {
          id: 'select_model',
          description: 'Select the appropriate LLM model tier.',
          delegates_to: { kind: 'tactic', candidates: ['042-model-discipline'] },
        },
      ],
    };

    const fixture = createFixture(content, 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(() => el.textContent).not.toThrow();
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('042-model-discipline'),
    );
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/packs/pack-1/tactics/rec-tactic-1');
  });

  it('resolves multiple candidates on the same step independently (one linked, one not)', async () => {
    const content = {
      action: 'specify',
      mission: 'software-dev',
      steps: [
        {
          id: 'multi_candidate_step',
          description: 'Delegates to two directive candidates.',
          delegates_to: {
            kind: 'directive',
            candidates: ['resolvable-directive', 'unresolvable-directive'],
          },
        },
      ],
    };
    listByPackAndType.mockImplementation((packId: string, artifactType: string) => {
      if (artifactType === 'directive') {
        return Promise.resolve({
          items: [
            makeArtifact({
              id: 'rec-resolvable',
              artifact_type: 'directive',
              artifact_id: 'resolvable-directive',
            }),
          ],
          page: 1,
          perPage: 200,
          totalItems: 1,
          totalPages: 1,
        });
      }
      return Promise.resolve(emptyListResult());
    });

    const fixture = createFixture(content, 'pack-1');
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    const resolvableLink = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('resolvable-directive'),
    );
    expect(resolvableLink).toBeTruthy();
    expect(resolvableLink?.getAttribute('href')).toBe('/packs/pack-1/directives/rec-resolvable');

    const unresolvableBadge = Array.from(el.querySelectorAll('[hlmbadge], [hlmBadge]')).find((s) =>
      s.textContent?.includes('unresolvable-directive'),
    );
    expect(unresolvableBadge).toBeTruthy();
    const unresolvableLink = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('unresolvable-directive'),
    );
    expect(unresolvableLink).toBeUndefined();
  });
});
