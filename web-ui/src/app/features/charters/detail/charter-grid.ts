import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';

import {
  ARTIFACT_FILTER_GROUPS,
  ARTIFACT_TYPE_LABELS,
  ARTIFACT_TYPE_ORDER,
} from '../../packs/detail';
import type {
  ArtifactKind,
  CharterGrid as CharterGridModel,
  CharterGridCard as CharterGridCardModel,
} from '../models';
import { CharterGridCard } from './charter-grid-card';

export interface CharterGridToggleEvent {
  card: CharterGridCardModel;
  enabled: boolean;
}

/** One raw type's cards within a (possibly multi-type) section, sorted by name. */
interface GridSubgroup {
  type: ArtifactKind;
  label: string;
  cards: CharterGridCardModel[];
}

interface GridSection {
  id: string;
  label: string;
  /** True for a section spanning more than one raw type (currently only `behavioural`) — drives whether per-type sub-headings render. */
  multiType: boolean;
  /** Non-empty type buckets only, each pre-sorted by `artifact_name`. */
  subgroups: GridSubgroup[];
  cardCount: number;
}

/**
 * Kind-grouped card layout with filters (FR-013, FR-016). Consumes exactly what
 * `ChartersApiService.getGrid()` returns — no client-side conflict/missing-source
 * computation — and applies category / search / conflicts-only filters as pure
 * `computed()` derivations (no extra network calls per filter interaction).
 */
@Component({
  selector: 'app-charter-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    HlmButtonImports,
    HlmEmptyImports,
    HlmInputImports,
    HlmLabelImports,
    HlmNativeSelectImports,
    CharterGridCard,
  ],
  host: {
    class: 'block',
  },
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Category filters">
        <button
          type="button"
          hlmBtn
          size="xs"
          [variant]="selectedGroupIds().size === 0 ? 'default' : 'outline'"
          (click)="clearGroups()"
        >
          All
        </button>
        @for (group of filterGroups; track group.id) {
          <button
            type="button"
            hlmBtn
            size="xs"
            [variant]="isGroupSelected(group.id) ? 'default' : 'outline'"
            [attr.aria-pressed]="isGroupSelected(group.id)"
            (click)="toggleGroup(group.id)"
          >
            {{ group.label }}
          </button>
        }
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <div class="flex min-w-[14rem] flex-col gap-1.5">
          <label hlmLabel for="charter-grid-pack">Pack</label>
          <hlm-native-select
            selectId="charter-grid-pack"
            class="w-full md:w-64"
            [value]="selectedPack() ?? ''"
            (valueChange)="onPackChange($event)"
          >
            @for (pack of packOptions(); track pack) {
              <option hlmNativeSelectOption [value]="pack">{{ pack }}</option>
            }
          </hlm-native-select>
        </div>
        <div class="flex min-w-[12rem] flex-col gap-1.5">
          <label hlmLabel for="charter-grid-search">Search</label>
          <input
            id="charter-grid-search"
            hlmInput
            type="search"
            placeholder="Search by name…"
            class="w-full md:w-80"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
          />
        </div>
        <button
          type="button"
          hlmBtn
          size="sm"
          [variant]="conflictsOnly() ? 'default' : 'outline'"
          [attr.aria-pressed]="conflictsOnly()"
          (click)="conflictsOnly.set(!conflictsOnly())"
        >
          Conflicts only
        </button>
      </div>

      @if (sections().length === 0) {
        <div hlmEmpty class="border-border min-h-48 border">
          <div hlmEmptyHeader>
            <div hlmEmptyTitle>No artifacts match your filters</div>
            <div hlmEmptyDescription>
              Try adjusting or clearing the filters to see more results.
            </div>
          </div>
          <div hlmEmptyContent>
            <button type="button" hlmBtn variant="outline" (click)="resetFilters()">
              Reset filters
            </button>
          </div>
        </div>
      } @else {
        <div class="flex flex-col gap-6">
          @for (section of sections(); track section.id) {
            <section class="flex flex-col gap-4">
              <h2 class="text-lg font-semibold">{{ section.label }}</h2>
              @if (section.cardCount === 0) {
                <p class="text-muted-foreground text-sm">No artifacts of this kind.</p>
              } @else {
                @for (subgroup of section.subgroups; track subgroup.type) {
                  <div class="flex flex-col gap-2">
                    @if (section.multiType) {
                      <h3
                        class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
                      >
                        {{ subgroup.label }}
                      </h3>
                    }
                    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      @for (card of subgroup.cards; track cardKey(card)) {
                        <app-charter-grid-card
                          [card]="card"
                          [busy]="
                            card.pack_artifact_id != null && card.pack_artifact_id === busyAddId()
                          "
                          [removing]="
                            card.charter_item_id != null &&
                            card.charter_item_id === busyRemoveId()
                          "
                          (toggle)="toggle.emit($event)"
                          (add)="add.emit($event)"
                          (resolveConflict)="resolveConflict.emit($event)"
                          (remove)="remove.emit($event)"
                        />
                      }
                    </div>
                  </div>
                }
              }
            </section>
          }
        </div>
      }
    </div>
  `,
})
export class CharterGrid {
  readonly grid = input.required<CharterGridModel>();
  /** `pack_artifact_id` of the card currently mid-"Add to Charter" request, if any. */
  readonly busyAddId = input<string | null>(null);
  /** `charter_item_id` of the card currently mid-"Remove" request, if any. */
  readonly busyRemoveId = input<string | null>(null);

  readonly toggle = output<CharterGridToggleEvent>();
  readonly add = output<CharterGridCardModel>();
  readonly resolveConflict = output<CharterGridCardModel>();
  /** Requests removing an item from the charter entirely (FR-010). */
  readonly remove = output<CharterGridCardModel>();

  protected readonly filterGroups = ARTIFACT_FILTER_GROUPS;

  protected readonly search = signal('');
  protected readonly conflictsOnly = signal(false);
  protected readonly selectedGroupIds = signal<Set<string>>(new Set());
  protected readonly selectedPack = signal<string | null>(null);

  /** Distinct source pack names present anywhere in the grid, sorted alphabetically. */
  protected readonly packOptions = computed(() => {
    const packs = new Set<string>();
    for (const kind of ARTIFACT_TYPE_ORDER) {
      for (const card of this.grid()[kind] ?? []) {
        packs.add(card.pack_name);
      }
    }
    return Array.from(packs).sort((a, b) => a.localeCompare(b));
  });

  constructor() {
    // A pack must always be selected: default to (and fall back to) the first
    // available pack whenever the current selection isn't one of the options.
    effect(() => {
      const options = this.packOptions();
      const current = this.selectedPack();
      if (current !== null && options.includes(current)) {
        return;
      }
      this.selectedPack.set(options[0] ?? null);
    });
  }

  private readonly filteredByKind = computed(() => {
    const term = this.search().trim().toLowerCase();
    const conflictsOnly = this.conflictsOnly();
    const pack = this.selectedPack();
    const result: Partial<Record<ArtifactKind, CharterGridCardModel[]>> = {};
    for (const kind of ARTIFACT_TYPE_ORDER) {
      const cards = this.grid()[kind] ?? [];
      result[kind] = cards.filter((card) => {
        if (pack && card.pack_name !== pack) {
          return false;
        }
        if (conflictsOnly && !card.conflicting) {
          return false;
        }
        if (term && !card.artifact_name.toLowerCase().includes(term)) {
          return false;
        }
        return true;
      });
    }
    return result;
  });

  /**
   * Fixed-order sections, one per selected (or all, when none selected) filter
   * group. A group with zero matching cards is still shown when its chip is
   * explicitly selected (so the filter doesn't silently vanish); otherwise
   * empty groups are hidden to avoid a wall of empty headings.
   *
   * Within a section, cards stay grouped by their original raw type (one
   * subgroup per type, in `ARTIFACT_FILTER_GROUPS`' declared type order) and
   * sorted alphabetically by name inside each subgroup — combining multiple
   * types under one chip/heading must not lose which type an item came from.
   * Sub-headings only render for sections spanning more than one raw type
   * (currently only `behavioural`); a singleton-type section's one subgroup
   * renders as a plain sorted grid, matching its pre-grouping appearance.
   */
  protected readonly sections = computed((): GridSection[] => {
    const selected = this.selectedGroupIds();
    const filtered = this.filteredByKind();
    const groups =
      selected.size > 0
        ? ARTIFACT_FILTER_GROUPS.filter((g) => selected.has(g.id))
        : ARTIFACT_FILTER_GROUPS;
    return groups
      .map((group) => {
        const subgroups: GridSubgroup[] = group.types
          .map((type) => ({
            type,
            label: ARTIFACT_TYPE_LABELS[type],
            cards: [...(filtered[type] ?? [])].sort((a, b) =>
              a.artifact_name.localeCompare(b.artifact_name),
            ),
          }))
          .filter((subgroup) => subgroup.cards.length > 0);
        const cardCount = subgroups.reduce((sum, subgroup) => sum + subgroup.cards.length, 0);
        return {
          id: group.id,
          label: group.label,
          multiType: group.types.length > 1,
          subgroups,
          cardCount,
        };
      })
      .filter((section) => section.cardCount > 0 || selected.has(section.id));
  });

  protected isGroupSelected(groupId: string): boolean {
    return this.selectedGroupIds().has(groupId);
  }

  protected toggleGroup(groupId: string): void {
    this.selectedGroupIds.update((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  protected clearGroups(): void {
    this.selectedGroupIds.set(new Set());
  }

  protected resetFilters(): void {
    this.search.set('');
    this.conflictsOnly.set(false);
    this.selectedGroupIds.set(new Set());
    this.selectedPack.set(this.packOptions()[0] ?? null);
  }

  protected onPackChange(value: string | null | undefined): void {
    if (value) {
      this.selectedPack.set(value);
    }
  }

  /** Unique per card even across two conflicting cards that share `artifact_id` from different packs. */
  protected cardKey(card: CharterGridCardModel): string {
    return card.charter_item_id ?? `${card.artifact_type}:${card.artifact_id}:${card.pack_name}`;
  }
}
