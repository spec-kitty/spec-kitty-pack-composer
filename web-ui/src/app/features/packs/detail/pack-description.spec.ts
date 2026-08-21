import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { PackDescription } from './pack-description';
import { longDescription } from './test-fixtures';

describe('PackDescription (FR-017)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackDescription],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not render an expand control for short text', () => {
    const fixture = TestBed.createComponent(PackDescription);
    fixture.componentRef.setInput('description', 'Short pack blurb.');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Short pack blurb.');
    expect(el.querySelector('button')).toBeNull();
  });

  it('collapses long text and toggles via Show more/less with aria-expanded', () => {
    const fixture = TestBed.createComponent(PackDescription);
    const text = longDescription(320);
    fixture.componentRef.setInput('description', text);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('button') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent?.trim()).toBe('Show more');
    expect(el.textContent).toContain('…');
    expect(el.textContent).not.toContain(text);

    // Spartan hlmBtn host present (NFR-002).
    expect(toggle.hasAttribute('hlmbtn') || toggle.className.length > 0).toBe(true);

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent?.trim()).toBe('Show less');
    expect(el.textContent).toContain(text);
  });
});
