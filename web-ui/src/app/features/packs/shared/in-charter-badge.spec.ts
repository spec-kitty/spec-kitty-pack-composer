import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { InCharterBadge } from './in-charter-badge';

describe('InCharterBadge (FR-007 / NFR-002)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InCharterBadge],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the "In Charter" badge when inCharter is true', () => {
    const fixture = TestBed.createComponent(InCharterBadge);
    fixture.componentRef.setInput('inCharter', true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('In Charter');
    expect(el.querySelector('[hlmBadge]')).toBeTruthy();
  });

  it('renders nothing (not a "not in charter" badge) when inCharter is false', () => {
    const fixture = TestBed.createComponent(InCharterBadge);
    fixture.componentRef.setInput('inCharter', false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('');
    expect(el.querySelector('[hlmBadge]')).toBeNull();
  });
});
