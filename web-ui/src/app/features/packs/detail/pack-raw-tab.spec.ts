import { TestBed } from '@angular/core/testing';

import { PackRawTab } from './pack-raw-tab';

describe('PackRawTab (FR-019 / FR-025 / C-002)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackRawTab],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders read-only JSON with no edit controls', () => {
    const fixture = TestBed.createComponent(PackRawTab);
    fixture.componentRef.setInput('snapshot', { hello: 'world' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('read-only');
    expect(el.querySelector('pre')?.textContent).toContain('"hello"');
    expect(el.querySelector('pre')?.getAttribute('aria-label')).toBe('Raw pack JSON');
    expect(el.querySelector('input, textarea, [contenteditable="true"]')).toBeNull();
    expect(el.querySelector('form')).toBeNull();
  });

  it('falls back to empty object when snapshot is null', () => {
    const fixture = TestBed.createComponent(PackRawTab);
    fixture.componentRef.setInput('snapshot', null);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('pre')?.textContent).toContain(
      '{}',
    );
  });
});
