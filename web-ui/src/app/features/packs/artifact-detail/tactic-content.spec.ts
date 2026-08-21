import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { TACTIC_CONTENT_FIXTURE, TACTIC_CONTENT_FIXTURE_EMPTY } from './content-fixtures';
import { TacticContent } from './tactic-content';

describe('TacticContent (FR-007)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TacticContent],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders purpose, all steps in order with titles+descriptions, and failure modes', () => {
    const fixture = TestBed.createComponent(TacticContent);
    fixture.componentRef.setInput('content', TACTIC_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Enforce short, verifiable coding loops');

    const stepTitles = Array.from(el.querySelectorAll('h3')).map((h) => h.textContent?.trim());
    expect(stepTitles).toContain('Steps');
    expect(stepTitles).toContain('Failure Modes');

    expect(el.textContent).toContain('Red');
    expect(el.textContent).toContain('Write the smallest failing automated test');
    expect(el.textContent).toContain('Green');
    expect(el.textContent).toContain('Maintain fast feedback');
    expect(el.textContent).toContain(
      'Rewriting the whole passage instead of removing the specific tic',
    );
  });

  it('renders a step with no description showing only its title', () => {
    const fixture = TestBed.createComponent(TacticContent);
    fixture.componentRef.setInput('content', TACTIC_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const stepCards = Array.from(el.querySelectorAll('.border-border'));
    const lastStepCard = stepCards[stepCards.length - 1];
    expect(lastStepCard.querySelector('p.font-semibold')?.textContent?.trim()).toBe(
      'Maintain fast feedback',
    );
    expect(lastStepCard.querySelectorAll('p').length).toBe(1);
  });

  it('renders nothing for empty content', () => {
    const fixture = TestBed.createComponent(TacticContent);
    fixture.componentRef.setInput('content', TACTIC_CONTENT_FIXTURE_EMPTY);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('section').length).toBe(0);
    expect(el.textContent?.trim()).toBe('');
  });
});
