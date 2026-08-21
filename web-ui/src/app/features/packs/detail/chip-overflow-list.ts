import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { ChipOverflowToggle } from './chip-overflow-toggle';

/** Matches the `h-5` badge height (rem) so the CSS clamp below lines up with `maxLines`. */
const CHIP_HEIGHT_REM = 1.25;
/** Matches the visible container's `gap-1` row gap (rem). */
const CHIP_ROW_GAP_REM = 0.25;

/**
 * Chip list that clamps to `maxLines` (default 2) lines, replacing overflow with a
 * "+N" toggle chip (`ChipOverflowToggle`). Clicking it expands to the full list and
 * swaps the toggle to "<" so it can be collapsed back.
 *
 * Line count is derived from actual rendered layout — an always-full, invisible
 * clone of the chip list is measured (via each chip's `offsetTop`) so the cutoff
 * adapts to container width and chip text length instead of a hardcoded count.
 * The cutoff also reserves room for the toggle chip itself (see
 * `reserveRoomForToggle`), so the "+N" count is never pushed onto a hidden line
 * and silently clipped. Re-measures on container resize; in non-layout
 * environments (e.g. jsdom tests) every chip reports `offsetTop === 0`, so
 * nothing is ever clamped by default.
 *
 * A CSS `max-height` clamp on the visible container is a belt-and-suspenders
 * guard on top of that: even if the measured cutoff is briefly stale, the
 * collapsed view can never visually exceed `maxLines` lines.
 */
@Component({
  selector: 'app-chip-overflow-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports, ChipOverflowToggle],
  host: {
    class: 'block',
  },
  template: `
    <div class="relative">
      <div
        #measureContainer
        class="pointer-events-none invisible absolute inset-x-0 top-0 flex flex-wrap gap-1"
        aria-hidden="true"
      >
        @for (item of items(); track item) {
          <span hlmBadge [variant]="variant()">{{ item }}</span>
        }
      </div>
      <div
        class="flex flex-wrap gap-1 overflow-hidden"
        data-chip-overflow-visible
        [style.max-height.rem]="expanded() ? null : collapsedMaxHeightRem()"
      >
        @for (item of displayedItems(); track item) {
          <span hlmBadge [variant]="variant()">{{ item }}</span>
        }
        @if (hasOverflow()) {
          <app-chip-overflow-toggle
            [expanded]="expanded()"
            [hiddenCount]="hiddenCount()"
            (toggled)="toggle()"
          />
        }
      </div>
    </div>
  `,
})
export class ChipOverflowList {
  readonly items = input.required<readonly string[]>();
  readonly variant = input<'outline' | 'secondary'>('outline');
  /** Max lines shown before collapsing overflow behind a "+N" toggle. */
  readonly maxLines = input(2);

  protected readonly expanded = signal(false);
  /** Count of items that fit within `maxLines`; null until measured (shows everything meanwhile). */
  private readonly fittingCount = signal<number | null>(null);

  protected readonly hasOverflow = computed(() => {
    const count = this.fittingCount();
    return count !== null && count < this.items().length;
  });

  protected readonly displayedItems = computed(() => {
    const items = this.items();
    if (this.expanded() || !this.hasOverflow()) {
      return items;
    }
    return items.slice(0, this.fittingCount() ?? items.length);
  });

  protected readonly hiddenCount = computed(
    () => this.items().length - this.displayedItems().length,
  );

  /** Hard CSS cap for the collapsed height of exactly `maxLines` chip rows. */
  protected readonly collapsedMaxHeightRem = computed(
    () => this.maxLines() * CHIP_HEIGHT_REM + (this.maxLines() - 1) * CHIP_ROW_GAP_REM,
  );

  private readonly measureContainer = viewChild<ElementRef<HTMLDivElement>>('measureContainer');
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    afterRenderEffect(() => {
      // Re-measure whenever the source list or line cap changes.
      this.items();
      this.maxLines();
      this.measure();
    });

    inject(DestroyRef).onDestroy(() => this.resizeObserver?.disconnect());
  }

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }

  private measure(): void {
    const el = this.measureContainer()?.nativeElement;
    if (!el) {
      return;
    }
    if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.recompute());
      this.resizeObserver.observe(el);
    }
    this.recompute();
  }

  private recompute(): void {
    const el = this.measureContainer()?.nativeElement;
    if (!el) {
      return;
    }
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length === 0) {
      this.fittingCount.set(0);
      return;
    }

    const maxLines = this.maxLines();
    const lineTops: number[] = [];
    for (const child of children) {
      const top = child.offsetTop;
      if (!lineTops.includes(top)) {
        lineTops.push(top);
      }
    }

    if (lineTops.length <= maxLines) {
      this.fittingCount.set(children.length);
      return;
    }

    const cutoffTop = lineTops[maxLines];
    const naiveCount = children.filter((child) => child.offsetTop < cutoffTop).length;
    const count = this.reserveRoomForToggle(el, children, naiveCount, cutoffTop);
    this.fittingCount.set(count);
  }

  /**
   * The naive cutoff only accounts for the real chips — but the toggle chip itself
   * still needs to land within the first `maxLines` lines, or it gets clipped by the
   * CSS max-height clamp and the "+N" count silently disappears. Shrink `count` until
   * a same-sized phantom toggle placed right after the Nth chip still fits before
   * `cutoffTop`, mutating and restoring the (already off-screen) measurement clone
   * synchronously so Angular never observes the intermediate DOM state.
   */
  private reserveRoomForToggle(
    container: HTMLElement,
    children: HTMLElement[],
    count: number,
    cutoffTop: number,
  ): number {
    while (count > 0) {
      const phantom = document.createElement('span');
      phantom.className = children[0].className;
      phantom.textContent = `+${children.length - count}`;
      phantom.setAttribute('aria-hidden', 'true');
      container.insertBefore(phantom, children[count] ?? null);
      const fits = phantom.offsetTop < cutoffTop;
      container.removeChild(phantom);
      if (fits) {
        return count;
      }
      count--;
    }
    return 0;
  }
}
