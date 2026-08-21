import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ChipOverflowToggle } from './chip-overflow-toggle';

describe('ChipOverflowToggle', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChipOverflowToggle],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows "+N" with a "N more" label when collapsed', () => {
    const fixture = TestBed.createComponent(ChipOverflowToggle);
    fixture.componentRef.setInput('expanded', false);
    fixture.componentRef.setInput('hiddenCount', 3);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('+3');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('3 more');
  });

  it('shows "<" with a "Show fewer" label when expanded', () => {
    const fixture = TestBed.createComponent(ChipOverflowToggle);
    fixture.componentRef.setInput('expanded', true);
    fixture.componentRef.setInput('hiddenCount', 3);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('<');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Show fewer');
  });

  it('emits toggled on click', () => {
    const fixture = TestBed.createComponent(ChipOverflowToggle);
    fixture.componentRef.setInput('expanded', false);
    fixture.componentRef.setInput('hiddenCount', 1);
    fixture.detectChanges();

    const spy = vi.fn();
    fixture.componentInstance.toggled.subscribe(spy);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(spy).toHaveBeenCalledOnce();
  });
});
