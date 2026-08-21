import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { PROCEDURE_CONTENT_FIXTURE, PROCEDURE_CONTENT_FIXTURE_EMPTY } from './content-fixtures';
import { ProcedureContent } from './procedure-content';

describe('ProcedureContent (FR-008)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProcedureContent],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders full content including an agent-actor step and a human-actor step, both showing their badge text', () => {
    const fixture = TestBed.createComponent(ProcedureContent);
    fixture.componentRef.setInput('content', PROCEDURE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(
      'Resolve software defects by writing a failing test that reproduces the issue',
    );
    expect(el.textContent).toContain('A bug has been reported or discovered');
    expect(el.textContent).toContain('A failing test existed that reproduced the bug');
    expect(el.textContent).toContain('Stage the test file and the production fix');

    const badges = Array.from(el.querySelectorAll('[data-slot="badge"]')).map((b) =>
      b.textContent?.trim(),
    );
    expect(badges).toContain('agent');
    expect(badges).toContain('human');
  });

  it('renders entry/exit conditions independently when only one is present', () => {
    const fixture = TestBed.createComponent(ProcedureContent);
    fixture.componentRef.setInput('content', { entry_condition: 'Only entry present.' });
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Only entry present.');
    expect(el.textContent).not.toContain('Exit Condition');

    fixture.componentRef.setInput('content', { exit_condition: 'Only exit present.' });
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Only exit present.');
    expect(el.textContent).not.toContain('Entry Condition');
  });

  it('renders anti-patterns with name+description, visually distinguished from Steps', () => {
    const fixture = TestBed.createComponent(ProcedureContent);
    fixture.componentRef.setInput('content', PROCEDURE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Fix First, Test Later');
    expect(el.textContent).toContain('Modifying production code before having a failing test');

    const antiPatternCards = el.querySelectorAll('.border-destructive\\/40');
    expect(antiPatternCards.length).toBe(2);
  });

  it('renders a step with no actor without a badge element', () => {
    const fixture = TestBed.createComponent(ProcedureContent);
    fixture.componentRef.setInput('content', PROCEDURE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const stepCards = Array.from(el.querySelectorAll('.border-border'));
    const noActorCard = stepCards.find((card) =>
      card.textContent?.includes('Run the full test suite'),
    );
    expect(noActorCard).toBeTruthy();
    expect(noActorCard?.querySelector('[data-slot="badge"]')).toBeNull();
  });

  it('renders nothing for empty content', () => {
    const fixture = TestBed.createComponent(ProcedureContent);
    fixture.componentRef.setInput('content', PROCEDURE_CONTENT_FIXTURE_EMPTY);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('section').length).toBe(0);
    expect(el.textContent?.trim()).toBe('');
  });
});
