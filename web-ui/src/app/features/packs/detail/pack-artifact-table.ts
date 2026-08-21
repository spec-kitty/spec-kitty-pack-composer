import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitFork } from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { ArtifactsReadService, buildResolvedRecordIdIndex, membershipKey } from '../data-access';
import type { ResolvedRecordIdIndex } from '../data-access';
import type { ArtifactType, ResolvedArtifact, ResolvedArtifactOrigin } from '../models';
import { ErrorState, LoadingIndicator } from '../../../shared';
import type { CharterItem } from '../../charters/models';
import { AddToCharterControl, InCharterBadge } from '../shared';
import { ARTIFACT_TYPE_ROUTE_SEGMENT } from './artifact-types';
import { PackFacetFilter } from './pack-facet-filter';

type SortOption = 'name' | '-name' | 'category' | '-category' | 'artifact_id' | '-artifact_id';

/** User-facing origin filter labels (FR-013), mapped to `ResolvedArtifactOrigin` values. */
const ORIGIN_LABELS: Record<ResolvedArtifactOrigin, string> = {
  own: 'Own',
  parent: 'Inherited from parent',
  'built-in': 'Built-in',
};
const ORIGIN_FILTER_OPTIONS: readonly string[] = Object.values(ORIGIN_LABELS);

function sortKeyValue(
  artifact: ResolvedArtifact,
  key: 'name' | 'category' | 'artifact_id',
): string {
  if (key === 'category') {
    return artifact.category ?? '';
  }
  return artifact[key];
}

/**
 * Typed-tab datatable (non-Profiles): category chips, search, sort, origin filter, count
 * (FR-011, FR-013, FR-020). Sourced from the pack's fully-resolved (own + inherited) artifact
 * set via `/resolved`; search/sort/category/origin are all applied client-side since that
 * endpoint has no query-parameter surface.
 */
@Component({
  selector: 'app-pack-artifact-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmNativeSelectImports,
    HlmTableImports,
    HlmTooltipImports,
    ErrorState,
    LoadingIndicator,
    PackFacetFilter,
    AddToCharterControl,
    InCharterBadge,
  ],
  providers: [provideIcons({ lucideGitFork })],
  host: {
    class: 'block space-y-3',
  },
  template: `
    <div class="flex flex-col gap-3">
      @if (categories().length > 0) {
        <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Category filters">
          <button
            type="button"
            hlmBtn
            size="xs"
            [variant]="selectedCategories().size === 0 ? 'default' : 'outline'"
            (click)="clearCategories()"
          >
            All
          </button>
          @for (category of categories(); track category) {
            <button
              type="button"
              hlmBtn
              size="xs"
              [variant]="isCategorySelected(category) ? 'default' : 'outline'"
              [attr.aria-pressed]="isCategorySelected(category)"
              (click)="toggleCategory(category)"
            >
              {{ category }}
            </button>
          }
        </div>
      }

      <div class="flex flex-wrap items-end gap-3">
        <div class="flex min-w-[12rem] flex-col gap-1.5">
          <label hlmLabel [for]="searchId()">Search</label>
          <input
            [id]="searchId()"
            hlmInput
            type="search"
            placeholder="Search by name…"
            class="w-full md:w-80"
            [ngModel]="search()"
            (ngModelChange)="onSearchChange($event)"
          />
        </div>
        <div class="flex w-44 flex-col gap-1.5">
          <label hlmLabel [for]="sortId()">Sort</label>
          <hlm-native-select
            [selectId]="sortId()"
            [value]="sort()"
            (valueChange)="onSortChange($event)"
          >
            <option hlmNativeSelectOption value="name">Name (A–Z)</option>
            <option hlmNativeSelectOption value="-name">Name (Z–A)</option>
            <option hlmNativeSelectOption value="category">Category (A–Z)</option>
            <option hlmNativeSelectOption value="-category">Category (Z–A)</option>
            <option hlmNativeSelectOption value="artifact_id">ID (A–Z)</option>
            <option hlmNativeSelectOption value="-artifact_id">ID (Z–A)</option>
          </hlm-native-select>
        </div>
        <app-pack-facet-filter
          title="Origin"
          [options]="originOptions"
          [selected]="selectedOrigins()"
          (selectedChange)="selectedOrigins.set($event)"
        />
        <p
          class="text-muted-foreground ml-auto flex h-8 min-w-[6rem] items-center text-sm tabular-nums"
          aria-live="polite"
        >
          {{ filteredArtifacts().length }}
          {{ filteredArtifacts().length === 1 ? 'result' : 'results' }}
        </p>
      </div>
    </div>

    @if (loading()) {
      <app-loading-indicator label="Loading artifacts" />
    } @else if (error(); as err) {
      <app-error-state [message]="err" (retry)="reload()" />
    } @else {
      <div hlmTableContainer>
        <table hlmTable class="table-fixed">
          <caption hlmTableCaption class="sr-only">
            {{ artifactType() }} artifacts
          </caption>
          <colgroup>
            @if (showCategoryColumn()) {
              <col class="w-[38%]" />
              <col class="w-[25%]" />
              <col class="w-[20%]" />
              <col class="w-[17%]" />
            } @else {
              <col class="w-[50%]" />
              <col class="w-[28%]" />
              <col class="w-[22%]" />
            }
          </colgroup>
          <thead hlmTableHeader>
            <tr hlmTableRow>
              <th hlmTableHead>Name</th>
              <th hlmTableHead>Origin</th>
              @if (showCategoryColumn()) {
                <th hlmTableHead>Category</th>
              }
              <th hlmTableHead>Charter</th>
            </tr>
          </thead>
          <tbody hlmTableBody>
            @for (artifact of filteredArtifacts(); track artifact.artifact_id) {
              <tr hlmTableRow>
                <td hlmTableCell class="overflow-hidden font-medium" [title]="artifact.name">
                  @if (artifactLink(artifact); as link) {
                    <a
                      class="focus-visible:ring-ring block truncate rounded-sm outline-none hover:underline focus-visible:ring-2"
                      [routerLink]="link"
                    >
                      {{ artifact.name }}
                    </a>
                  } @else {
                    <span class="block truncate">{{ artifact.name }}</span>
                  }
                </td>
                <td hlmTableCell class="overflow-hidden">
                  @if (artifact.origin === 'parent' && artifact.source_pack_name) {
                    <span
                      hlmBadge
                      variant="outline"
                      tabindex="0"
                      class="inline-flex max-w-full items-center gap-1"
                      [hlmTooltip]="originTooltip(artifact)"
                      [attr.aria-label]="originTooltip(artifact)"
                    >
                      <ng-icon name="lucideGitFork" class="shrink-0" aria-hidden="true" />
                      <span class="truncate">{{ artifact.source_pack_name }}</span>
                    </span>
                  } @else {
                    <span
                      hlmBadge
                      [variant]="artifact.origin === 'own' ? 'secondary' : 'outline'"
                      class="inline-flex max-w-full truncate"
                      [title]="originLabel(artifact)"
                    >
                      {{ originLabel(artifact) }}
                    </span>
                  }
                </td>
                @if (showCategoryColumn()) {
                  <td hlmTableCell class="truncate" [title]="artifact.category || ''">
                    {{ artifact.category || '—' }}
                  </td>
                }
                <td hlmTableCell>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <app-in-charter-badge [inCharter]="isInCharter(artifact)" />
                    @if (packArtifactIdFor(artifact); as packArtifactId) {
                      <app-add-to-charter-control
                        [artifactType]="artifact.artifact_type"
                        [artifactId]="artifact.artifact_id"
                        [packArtifactId]="packArtifactId"
                        [artifactName]="artifact.name"
                        [membershipOverride]="membershipFor(artifact)"
                        (membershipChanged)="membershipChanged.emit()"
                      />
                    }
                  </div>
                </td>
              </tr>
            } @empty {
              <tr hlmTableRow>
                <td hlmTableCell class="text-muted-foreground" [attr.colSpan]="tableColumnCount()">
                  No artifacts match the current filters.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class PackArtifactTable {
  private readonly artifactsRead = inject(ArtifactsReadService);

  readonly packId = input.required<string>();
  readonly artifactType = input.required<ArtifactType>();
  /** Bumped by parent after refresh so the table reloads. */
  readonly reloadToken = input(0);
  /**
   * Batch-loaded charter membership for the whole pack (FR-007), keyed by
   * {@link membershipKey}. Supplied once by the parent (`PackArtifactTabs`) via
   * `CharterMembershipService.listMembershipForPack` — never fetched per-row/per-tab here.
   */
  readonly membership = input<Map<string, CharterItem>>(new Map());

  /** Bubbled up from a row's `AddToCharterControl` so the parent can refresh its cached map. */
  readonly membershipChanged = output<void>();

  protected readonly originOptions = ORIGIN_FILTER_OPTIONS;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly artifacts = signal<ResolvedArtifact[]>([]);
  /** Resolves a row's owning-pack PocketBase record id, for building its `routerLink`; resolved in parallel with (not gating) row render. */
  protected readonly recordIds = signal<ResolvedRecordIdIndex | null>(null);
  protected readonly search = signal('');
  protected readonly sort = signal<SortOption>('name');
  protected readonly selectedCategories = signal<Set<string>>(new Set());
  protected readonly selectedOrigins = signal<Set<string>>(new Set());

  /** Unique per typed tab so multiple tables do not collide on NFR-003 ids. */
  protected readonly searchId = computed(() => `artifact-search-${this.artifactType()}`);
  protected readonly sortId = computed(() => `artifact-sort-${this.artifactType()}`);

  /** Category is a meaningful grouping for Templates/Glossary; redundant elsewhere. */
  protected readonly showCategoryColumn = computed(
    () => this.artifactType() === 'template' || this.artifactType() === 'glossary',
  );
  protected readonly tableColumnCount = computed(() => (this.showCategoryColumn() ? 4 : 3));

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  protected readonly categories = computed(() => {
    const values = new Set<string>();
    for (const artifact of this.artifacts()) {
      const category = artifact.category?.trim();
      if (category) {
        values.add(category);
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  });

  private readonly searchedArtifacts = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) {
      return this.artifacts();
    }
    return this.artifacts().filter((artifact) => artifact.name.toLowerCase().includes(term));
  });

  private readonly categoryFilteredArtifacts = computed(() => {
    const selected = this.selectedCategories();
    if (selected.size === 0) {
      return this.searchedArtifacts();
    }
    return this.searchedArtifacts().filter((artifact) => {
      const category = artifact.category?.trim();
      return category !== undefined && selected.has(category);
    });
  });

  private readonly originFilteredArtifacts = computed(() => {
    const selected = this.selectedOrigins();
    if (selected.size === 0) {
      return this.categoryFilteredArtifacts();
    }
    return this.categoryFilteredArtifacts().filter((artifact) =>
      selected.has(ORIGIN_LABELS[artifact.origin]),
    );
  });

  protected readonly filteredArtifacts = computed(() => {
    const sort = this.sort();
    const desc = sort.startsWith('-');
    const key = (desc ? sort.slice(1) : sort) as 'name' | 'category' | 'artifact_id';
    const items = [...this.originFilteredArtifacts()];
    items.sort((a, b) => {
      const av = sortKeyValue(a, key);
      const bv = sortKeyValue(b, key);
      const cmp = av.localeCompare(bv);
      return desc ? -cmp : cmp;
    });
    return items;
  });

  constructor() {
    effect(() => {
      const packId = this.packId();
      const type = this.artifactType();
      // Depend on reloadToken so refresh re-fetches.
      this.reloadToken();
      void this.load(packId, type);
    });
  }

  protected onSearchChange(value: string): void {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    this.searchDebounce = setTimeout(() => {
      this.search.set(value);
    }, 200);
  }

  protected onSortChange(value: string | undefined | null): void {
    if (
      value === 'name' ||
      value === '-name' ||
      value === 'category' ||
      value === '-category' ||
      value === 'artifact_id' ||
      value === '-artifact_id'
    ) {
      this.sort.set(value);
    }
  }

  protected isCategorySelected(category: string): boolean {
    return this.selectedCategories().has(category);
  }

  protected toggleCategory(category: string): void {
    this.selectedCategories.update((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  protected clearCategories(): void {
    this.selectedCategories.set(new Set());
  }

  protected reload(): void {
    void this.load(this.packId(), this.artifactType());
  }

  protected originLabel(artifact: ResolvedArtifact): string {
    if (artifact.origin === 'parent') {
      return artifact.source_pack_name
        ? `Inherited from ${artifact.source_pack_name}`
        : ORIGIN_LABELS.parent;
    }
    return ORIGIN_LABELS[artifact.origin];
  }

  /** Tooltip shown on hover/focus for the parent-origin icon badge (NFR-003: non-color-only cue). */
  protected originTooltip(artifact: ResolvedArtifact): string {
    return `Inherited from ${artifact.source_pack_name}`;
  }

  /** Route to the artifact's owning pack's detail page, or `null` if its record id is unknown. */
  protected artifactLink(artifact: ResolvedArtifact): [string, string, string, string] | null {
    const sourcePackId = artifact.origin === 'own' ? this.packId() : artifact.source_pack_id;
    if (!sourcePackId) {
      return null;
    }
    const recordId = this.recordIds()?.recordIdFor(artifact);
    if (!recordId) {
      return null;
    }
    return ['/packs', sourcePackId, ARTIFACT_TYPE_ROUTE_SEGMENT[artifact.artifact_type], recordId];
  }

  /** The `pack_artifacts` record id backing this row, or `null` when unresolvable (e.g. built-in). */
  protected packArtifactIdFor(artifact: ResolvedArtifact): string | null {
    return this.recordIds()?.recordIdFor(artifact) ?? null;
  }

  /** Explicit `CharterItem | null` (never `undefined`) so the control stays in batch/override mode. */
  protected membershipFor(artifact: ResolvedArtifact): CharterItem | null {
    return this.membership().get(membershipKey(artifact.artifact_type, artifact.artifact_id)) ?? null;
  }

  protected isInCharter(artifact: ResolvedArtifact): boolean {
    return this.membershipFor(artifact) !== null;
  }

  private async load(packId: string, artifactType: ArtifactType): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const resolved = await this.artifactsRead.listResolved(packId);
      const filtered = resolved.filter((artifact) => artifact.artifact_type === artifactType);
      this.artifacts.set(filtered);
      // Drop selected categories that no longer exist in the result set.
      const available = new Set(
        filtered
          .map((item) => item.category?.trim())
          .filter((value): value is string => Boolean(value)),
      );
      this.selectedCategories.update((current) => {
        const next = new Set([...current].filter((value) => available.has(value)));
        return next.size === current.size ? current : next;
      });

      // Runs in parallel with (does not gate) row render — rows show immediately from
      // `listResolved()`, and links "light up" once this resolves (signal-driven template).
      this.recordIds.set(null);
      void buildResolvedRecordIdIndex(
        this.artifactsRead,
        packId,
        artifactType,
        filtered,
        'artifact-table-record-ids',
      ).then(
        (recordIds) => this.recordIds.set(recordIds),
        () => this.recordIds.set(null),
      );
    } catch (err) {
      this.artifacts.set([]);
      this.error.set(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      this.loading.set(false);
    }
  }
}
