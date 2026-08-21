import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { DIRECTIVE_CONTENT_FIXTURE, DIRECTIVE_CONTENT_FIXTURE_EMPTY } from './content-fixtures';
import { DirectiveContent } from './directive-content';

describe('DirectiveContent (FR-006)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DirectiveContent],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders all 5 sections with correct text/values for a fully-populated fixture', () => {
    const fixture = TestBed.createComponent(DirectiveContent);
    fixture.componentRef.setInput('content', DIRECTIVE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('System designs must maintain clear separation');
    expect(el.textContent).toContain('Applies to all design proposals');
    expect(el.textContent).toContain('required');
    expect(el.textContent).toContain('Define explicit component boundaries');
    expect(el.textContent).toContain('Components must not share mutable state');

    const headings = Array.from(el.querySelectorAll('h3')).map((h) => h.textContent?.trim());
    expect(headings).toContain('Enforcement');
    expect(headings).toContain('Instructions');
    expect(headings).toContain('Integrity Rules');
  });

  it('renders no section markup at all for empty content', () => {
    const fixture = TestBed.createComponent(DirectiveContent);
    fixture.componentRef.setInput('content', DIRECTIVE_CONTENT_FIXTURE_EMPTY);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('section').length).toBe(0);
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders Instructions as an ordered list in fixture array order', () => {
    const fixture = TestBed.createComponent(DirectiveContent);
    fixture.componentRef.setInput('content', DIRECTIVE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const ol = el.querySelector('ol');
    expect(ol).toBeTruthy();
    const items = Array.from(ol!.querySelectorAll('li')).map((li) => li.textContent?.trim());
    expect(items[0]).toContain('Define explicit component boundaries');
    expect(items[1]).toContain('Record boundary decisions and the rationale');
  });

  it('renders Enforcement as a badge element', () => {
    const fixture = TestBed.createComponent(DirectiveContent);
    fixture.componentRef.setInput('content', DIRECTIVE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const badge = el.querySelector('[data-slot="badge"]');
    expect(badge).toBeTruthy();
    expect(badge?.textContent?.trim()).toBe('required');
  });
});
