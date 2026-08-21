import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { TOOLGUIDE_CONTENT_FIXTURE, TOOLGUIDE_CONTENT_FIXTURE_EMPTY } from './content-fixtures';
import { ToolguideContent } from './toolguide-content';

describe('ToolguideContent (FR-010)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolguideContent],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders all 3 fields from the fully-populated fixture', () => {
    const fixture = TestBed.createComponent(ToolguideContent);
    fixture.componentRef.setInput('content', TOOLGUIDE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const headings = Array.from(el.querySelectorAll('h3')).map((node) => node.textContent?.trim());

    expect(headings).toEqual(['Tool', 'Guide Path', 'Summary']);
    expect(el.textContent).toContain('mermaid');
    expect(el.textContent).toContain('src/doctrine/toolguides/built-in/MERMAID_DIAGRAMMING.md');
    expect(el.textContent).toContain('Reference guide for using Mermaid');
  });

  it('renders guidePath as <code> with zero <a>/routerLink wrapping it', () => {
    const fixture = TestBed.createComponent(ToolguideContent);
    fixture.componentRef.setInput('content', TOOLGUIDE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const codeEl = Array.from(el.querySelectorAll('code')).find((node) =>
      node.textContent?.includes('src/doctrine/toolguides/built-in/MERMAID_DIAGRAMMING.md'),
    );
    expect(codeEl).toBeTruthy();
    expect(codeEl!.closest('a')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('[routerLink]')).toBeNull();
  });

  it('renders the tool field as a badge', () => {
    const fixture = TestBed.createComponent(ToolguideContent);
    fixture.componentRef.setInput('content', TOOLGUIDE_CONTENT_FIXTURE);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const badge = el.querySelector('span[data-slot="badge"]');
    expect(badge?.textContent).toContain('mermaid');
  });

  it('renders just the summary when only summary is populated', () => {
    const fixture = TestBed.createComponent(ToolguideContent);
    fixture.componentRef.setInput('content', { summary: 'Just a summary.' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const headings = Array.from(el.querySelectorAll('h3')).map((node) => node.textContent?.trim());
    expect(headings).toEqual(['Summary']);
    expect(el.textContent).toContain('Just a summary.');
  });

  it('renders nothing for empty content', () => {
    const fixture = TestBed.createComponent(ToolguideContent);
    fixture.componentRef.setInput('content', TOOLGUIDE_CONTENT_FIXTURE_EMPTY);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('h3').length).toBe(0);
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders nothing for null/undefined content', () => {
    for (const value of [null, undefined]) {
      const fixture = TestBed.createComponent(ToolguideContent);
      fixture.componentRef.setInput('content', value);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent?.trim()).toBe('');
    }
  });
});
