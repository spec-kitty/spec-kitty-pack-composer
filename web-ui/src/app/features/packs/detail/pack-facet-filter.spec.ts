import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { PackFacetFilter } from './pack-facet-filter';

describe('PackFacetFilter', () => {
  beforeAll(() => {
    // jsdom doesn't implement scrollIntoView; the command list uses it to keep
    // the active item in view when opened.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackFacetFilter],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('collapses options behind a trigger button and emits selection changes', async () => {
    const fixture = TestBed.createComponent(PackFacetFilter);
    fixture.componentRef.setInput('title', 'Domain');
    fixture.componentRef.setInput('options', ['finance', 'software']);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector<HTMLButtonElement>('[aria-label="Domain filter"]');
    expect(trigger).toBeTruthy();
    // Options aren't rendered inline until the popover is opened (saves space).
    expect(el.textContent).not.toContain('finance');

    const emitted: Set<string>[] = [];
    fixture.componentInstance.selectedChange.subscribe((value) => emitted.push(value));

    trigger!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const financeItem = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('button[hlm-command-item]'),
    ).find((button) => button.textContent?.includes('finance'));
    expect(financeItem).toBeTruthy();
    expect(financeItem?.getAttribute('aria-pressed')).toBe('false');

    financeItem!.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0].has('finance')).toBe(true);
  });
});
