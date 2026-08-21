import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ChipOverflowList } from './chip-overflow-list';

describe('ChipOverflowList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChipOverflowList],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function settle(fixture: ReturnType<typeof TestBed.createComponent>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function visible(el: HTMLElement): HTMLElement {
    return el.querySelector('[data-chip-overflow-visible]') as HTMLElement;
  }

  it('renders every item and no toggle when there is no overflow', async () => {
    const fixture = TestBed.createComponent(ChipOverflowList);
    fixture.componentRef.setInput('items', ['alpha', 'beta', 'gamma']);
    await settle(fixture);

    const el = fixture.nativeElement as HTMLElement;
    expect(visible(el).textContent).toContain('alpha');
    expect(visible(el).textContent).toContain('beta');
    expect(visible(el).textContent).toContain('gamma');
    expect(el.querySelector('button')).toBeNull();
  });

  it('shows a "+N" toggle that expands to the full list and back (simulated overflow)', async () => {
    const fixture = TestBed.createComponent(ChipOverflowList);
    fixture.componentRef.setInput('items', ['a', 'b', 'c', 'd', 'e']);
    await settle(fixture);

    // jsdom has no real layout, so every chip reports offsetTop 0 (single line) and
    // nothing is clamped by default. Drive the private "fittingCount" signal directly
    // to exercise the clamp/expand/collapse behavior that real layout would trigger.
    (fixture.componentInstance as unknown as { fittingCount: { set(v: number): void } })[
      'fittingCount'
    ].set(3);
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(visible(el).textContent).toContain('a');
    expect(visible(el).textContent).toContain('c');
    expect(visible(el).textContent).not.toContain('d');
    expect(visible(el).textContent).not.toContain('e');
    const toggle = el.querySelector('button');
    expect(toggle).toBeTruthy();
    expect(toggle?.textContent?.trim()).toBe('+2');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBe('2 more');

    toggle!.click();
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(visible(el).textContent).toContain('d');
    expect(visible(el).textContent).toContain('e');
    const collapseToggle = el.querySelector('button');
    expect(collapseToggle?.textContent?.trim()).toBe('<');
    expect(collapseToggle?.getAttribute('aria-expanded')).toBe('true');

    collapseToggle!.click();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expect(visible(el).textContent).not.toContain('d');
    expect(el.querySelector('button')?.textContent?.trim()).toBe('+2');
  });

  it('reserveRoomForToggle shrinks the count when the toggle itself would overflow the cutoff line', async () => {
    const fixture = TestBed.createComponent(ChipOverflowList);
    fixture.componentRef.setInput('items', ['a', 'b', 'c']);
    await settle(fixture);

    const container = document.createElement('div');
    const children = ['a', 'b', 'c'].map((text) => {
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = text;
      container.appendChild(span);
      return span;
    });

    // First attempt (count=3, toggle inserted at the end) reports offsetTop past the
    // cutoff — simulating it wrapping onto a hidden 3rd line. The algorithm must then
    // retry with a smaller count until a candidate placement fits.
    let attempt = 0;
    const originalInsertBefore = container.insertBefore.bind(container);
    vi.spyOn(container, 'insertBefore').mockImplementation(((node: Node, ref: Node | null) => {
      const result = originalInsertBefore(node, ref);
      attempt++;
      Object.defineProperty(node, 'offsetTop', {
        configurable: true,
        value: attempt === 1 ? 100 : 0,
      });
      return result;
    }) as typeof container.insertBefore);

    const instance = fixture.componentInstance as unknown as {
      reserveRoomForToggle(
        container: HTMLElement,
        children: HTMLElement[],
        count: number,
        cutoffTop: number,
      ): number;
    };
    const result = instance['reserveRoomForToggle'](container, children, 3, 50);

    expect(result).toBe(2);
    expect(attempt).toBe(2);
    // The measurement clone is restored to its original state after each probe.
    expect(container.children.length).toBe(3);
  });
});
