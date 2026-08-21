import { TestBed } from '@angular/core/testing';

import { ArtifactRawTab } from './artifact-raw-tab';

describe('ArtifactRawTab (FR-014 / FR-018 / FR-020)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtifactRawTab],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders read-only JSON with no edit controls', () => {
    const fixture = TestBed.createComponent(ArtifactRawTab);
    fixture.componentRef.setInput('content', { hello: 'world' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('read-only');
    expect(el.querySelector('pre')?.textContent).toContain('"hello"');
    expect(el.querySelector('pre')?.getAttribute('aria-label')).toBe('Raw artifact JSON');
    expect(el.querySelector('pre')?.getAttribute('role')).toBe('region');
    expect(el.querySelector('input, textarea, [contenteditable="true"]')).toBeNull();
    expect(el.querySelector('form')).toBeNull();
  });

  it('falls back to an empty object when content is null or undefined', () => {
    const fixture = TestBed.createComponent(ArtifactRawTab);
    fixture.componentRef.setInput('content', null);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('pre')?.textContent).toContain(
      '{}',
    );

    fixture.componentRef.setInput('content', undefined);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('pre')?.textContent).toContain(
      '{}',
    );
  });

  it('renders the parse-error stub shape without crashing', () => {
    const fixture = TestBed.createComponent(ArtifactRawTab);
    fixture.componentRef.setInput('content', {
      path: 'directives/broken.yaml',
      error: 'invalid YAML',
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('pre')?.textContent).toContain('directives/broken.yaml');
    expect(el.querySelector('pre')?.textContent).toContain('invalid YAML');
  });
});
