import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { STYLEGUIDE_CONTENT_FIXTURE, STYLEGUIDE_CONTENT_FIXTURE_EMPTY } from './content-fixtures';
import { StyleguideContent } from './styleguide-content';

describe('StyleguideContent (FR-009 / NFR-003)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StyleguideContent],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders all 6 sections from the fully-populated fixture', () => {
    const fixture = TestBed.createComponent(StyleguideContent);
    fixture.componentRef.setInput('content', STYLEGUIDE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const headings = Array.from(el.querySelectorAll('h3')).map((node) => node.textContent?.trim());

    expect(headings).toEqual([
      'Scope',
      'Principles',
      'Patterns',
      'Anti-Patterns',
      'Quality Test',
      'Tooling',
    ]);
    expect(el.textContent).toContain('docs');
    expect(el.textContent).toContain('Single root, 13 sections');
    expect(el.textContent).toContain('doc_status namespacing');
    expect(el.textContent).toContain('Second documentation root');
    expect(el.textContent).toContain('A documentation change satisfies this styleguide');
    expect(el.textContent).toContain('structure-single-root-13-section');
  });

  it('renders a pattern with only goodExample (no badExample) with just that example', () => {
    const fixture = TestBed.createComponent(StyleguideContent);
    fixture.componentRef.setInput('content', {
      patterns: [{ name: 'Solo good example', good_example: 'do it this way' }],
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Solo good example');
    expect(el.textContent).toContain('do it this way');
    expect(el.textContent).toContain('Good');
    expect(el.textContent).not.toContain('Avoid');
  });

  it('renders a pattern with only badExample (no goodExample) with just that example', () => {
    const fixture = TestBed.createComponent(StyleguideContent);
    fixture.componentRef.setInput('content', {
      patterns: [{ name: 'Solo bad example', bad_example: "don't do it this way" }],
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Solo bad example');
    expect(el.textContent).toContain("don't do it this way");
    expect(el.textContent).toContain('Avoid');
    expect(el.textContent).not.toContain('Good');
  });

  it('renders an arbitrary tooling key not present in any hardcoded list', () => {
    const fixture = TestBed.createComponent(StyleguideContent);
    fixture.componentRef.setInput('content', {
      tooling: { experimental_flag: 'on' },
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('experimental_flag');
    expect(el.textContent).toContain('on');
  });

  it('carries a non-color-only distinguishing label for good/bad examples (visible text, not just a class)', () => {
    const fixture = TestBed.createComponent(StyleguideContent);
    fixture.componentRef.setInput('content', STYLEGUIDE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const goodLabels = Array.from(el.querySelectorAll('span')).filter(
      (span) => span.textContent?.trim() === 'Good',
    );
    const avoidLabels = Array.from(el.querySelectorAll('span')).filter(
      (span) => span.textContent?.trim() === 'Avoid',
    );
    expect(goodLabels.length).toBeGreaterThan(0);
    expect(avoidLabels.length).toBeGreaterThan(0);
  });

  it('applies distinct visual treatment (different classes) to good vs. bad example blocks', () => {
    const fixture = TestBed.createComponent(StyleguideContent);
    fixture.componentRef.setInput('content', STYLEGUIDE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const destructiveBlocks = el.querySelectorAll('.border-destructive\\/50');
    const neutralGoodBlocks = el.querySelectorAll('.bg-muted\\/40');
    expect(destructiveBlocks.length).toBeGreaterThan(0);
    expect(neutralGoodBlocks.length).toBeGreaterThan(0);
  });

  it('anti-patterns are visually distinguishable from patterns as separate sections', () => {
    const fixture = TestBed.createComponent(StyleguideContent);
    fixture.componentRef.setInput('content', STYLEGUIDE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const headings = Array.from(el.querySelectorAll('h3')).map((node) => node.textContent?.trim());
    expect(headings).toContain('Patterns');
    expect(headings).toContain('Anti-Patterns');
    expect(headings.indexOf('Patterns')).toBeLessThan(headings.indexOf('Anti-Patterns'));
  });

  it('renders nothing for empty content', () => {
    const fixture = TestBed.createComponent(StyleguideContent);
    fixture.componentRef.setInput('content', STYLEGUIDE_CONTENT_FIXTURE_EMPTY);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('h3').length).toBe(0);
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders nothing for null/undefined content', () => {
    for (const value of [null, undefined]) {
      const fixture = TestBed.createComponent(StyleguideContent);
      fixture.componentRef.setInput('content', value);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent?.trim()).toBe('');
    }
  });
});
