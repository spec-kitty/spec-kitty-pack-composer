import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGitFork } from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { ArtifactsReadService, buildResolvedRecordIdIndex } from '../data-access';
import type { ResolvedRecordIdIndex } from '../data-access';
import type { ResolvedArtifact, ResolvedArtifactOrigin } from '../models';
import { ErrorState, LoadingIndicator } from '../../../shared';
import { ChipOverflowList } from './chip-overflow-list';
import { PackFacetFilter } from './pack-facet-filter';

/** User-facing origin filter labels (FR-013), mapped to `ResolvedArtifactOrigin` values. */
const ORIGIN_LABELS: Record<ResolvedArtifactOrigin, string> = {
  own: 'Own',
  parent: 'Inherited from parent',
  'built-in': 'Built-in',
};
const ORIGIN_FILTER_OPTIONS: readonly string[] = Object.values(ORIGIN_LABELS);

/**
 * Profiles tab — name search, origin/domain_keywords/roles multi filters, sorted by name
 * (FR-011, FR-013, FR-021). Sourced from the pack's fully-resolved artifact set via `/resolved`.
 *
 * Navigation note (T041): `ResolvedArtifact` has no PocketBase record `id` (only `artifact_id`),
 * but the Agent Profile Detail route (`/packs/:id/agents/:profileId`) is keyed by record id.
 * We build a `buildResolvedRecordIdIndex()` lookup (own pack + every `source_pack_id` among
 * inherited/built-in profiles) and link each row to its owning pack's detail page.
 */
@Component({
  selector: 'app-pack-profiles-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    NgIcon,
    ChipOverflowList,
    HlmBadgeImports,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmTableImports,
    HlmTooltipImports,
    ErrorState,
    LoadingIndicator,
    PackFacetFilter,
  ],
  providers: [provideIcons({ lucideGitFork })],
  host: {
    class: 'block space-y-3',
  },
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex min-w-[12rem] flex-col gap-1.5">
          <label hlmLabel for="profile-search">Search profiles</label>
          <input
            id="profile-search"
            hlmInput
            type="search"
            placeholder="Search by name…"
            class="w-full md:w-80"
            [ngModel]="search()"
            (ngModelChange)="onSearchChange($event)"
          />
        </div>

        @if (domainOptions().length > 0) {
          <app-pack-facet-filter
            title="Domain"
            [options]="domainOptions()"
            [selected]="selectedDomains()"
            (selectedChange)="selectedDomains.set($event)"
          />
        }

        @if (roleOptions().length > 0) {
          <app-pack-facet-filter
            title="Role"
            [options]="roleOptions()"
            [selected]="selectedRoles()"
            (selectedChange)="selectedRoles.set($event)"
          />
        }

        <app-pack-facet-filter
          title="Origin"
          [options]="originOptions"
          [selected]="selectedOrigins()"
          (selectedChange)="selectedOrigins.set($event)"
        />

        @if (selectedDomains().size > 0 || selectedRoles().size > 0 || selectedOrigins().size > 0) {
          <button type="button" hlmBtn variant="ghost" size="sm" (click)="clearFilters()">
            Reset
          </button>
        }

        <p
          class="text-muted-foreground ml-auto flex h-8 min-w-[6rem] items-center text-sm tabular-nums"
          aria-live="polite"
        >
          {{ filteredProfiles().length }}
          {{ filteredProfiles().length === 1 ? 'profile' : 'profiles' }}
        </p>
      </div>
    </div>

    @if (loading()) {
      <app-loading-indicator label="Loading profiles" />
    } @else if (error(); as err) {
      <app-error-state [message]="err" (retry)="reload()" />
    } @else {
      <div hlmTableContainer>
        <table hlmTable class="table-fixed">
          <caption hlmTableCaption class="sr-only">Agent profiles</caption>
          <colgroup>
            <col class="w-1/5" />
            <col class="w-1/5" />
            <col class="w-1/5" />
            <col class="w-1/5" />
          </colgroup>
          <thead hlmTableHeader>
            <tr hlmTableRow>
              <th hlmTableHead>Name</th>
              <th hlmTableHead>Origin</th>
              <th hlmTableHead>Domains</th>
              <th hlmTableHead>Roles</th>
            </tr>
          </thead>
          <tbody hlmTableBody>
            @for (profile of filteredProfiles(); track profile.artifact_id) {
              <tr hlmTableRow>
                <td hlmTableCell class="font-medium whitespace-normal">
                  @if (profileLink(profile); as link) {
                    <a
                      class="focus-visible:ring-ring rounded-sm outline-none hover:underline focus-visible:ring-2"
                      [routerLink]="link"
                    >
                      {{ profile.name }}
                    </a>
                  } @else {
                    {{ profile.name }}
                  }
                </td>
                <td hlmTableCell>
                  @if (profile.origin === 'parent' && profile.source_pack_name) {
                    <span
                      hlmBadge
                      variant="outline"
                      tabindex="0"
                      class="inline-flex items-center gap-1"
                      [hlmTooltip]="originTooltip(profile)"
                      [attr.aria-label]="originTooltip(profile)"
                    >
                      <ng-icon name="lucideGitFork" aria-hidden="true" />
                      {{ profile.source_pack_name }}
                    </span>
                  } @else {
                    <span hlmBadge [variant]="profile.origin === 'own' ? 'secondary' : 'outline'">
                      {{ originLabel(profile) }}
                    </span>
                  }
                </td>
                <td hlmTableCell class="whitespace-normal">
                  @if ((profile.domain_keywords ?? []).length > 0) {
                    <app-chip-overflow-list [items]="profile.domain_keywords ?? []" variant="outline" />
                  } @else {
                    <span class="text-muted-foreground">—</span>
                  }
                </td>
                <td hlmTableCell class="whitespace-normal">
                  @if ((profile.roles ?? []).length > 0) {
                    <app-chip-overflow-list [items]="profile.roles ?? []" variant="secondary" />
                  } @else {
                    <span class="text-muted-foreground">—</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr hlmTableRow>
                <td hlmTableCell class="text-muted-foreground" [attr.colSpan]="4">
                  No profiles match the current filters.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class PackProfilesTab {
  private readonly artifactsRead = inject(ArtifactsReadService);

  readonly packId = input.required<string>();
  readonly reloadToken = input(0);

  protected readonly originOptions = ORIGIN_FILTER_OPTIONS;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly profiles = signal<ResolvedArtifact[]>([]);
  protected readonly search = signal('');
  protected readonly selectedDomains = signal<Set<string>>(new Set());
  protected readonly selectedRoles = signal<Set<string>>(new Set());
  protected readonly selectedOrigins = signal<Set<string>>(new Set());
  /** Resolves a profile's owning-pack PocketBase record id (own pack + every ancestor pack referenced by an inherited/built-in profile). */
  protected readonly recordIds = signal<ResolvedRecordIdIndex | null>(null);

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  protected readonly domainOptions = computed(() => {
    const values = new Set<string>();
    for (const profile of this.profiles()) {
      for (const keyword of profile.domain_keywords ?? []) {
        const trimmed = keyword.trim();
        if (trimmed) {
          values.add(trimmed);
        }
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  });

  protected readonly roleOptions = computed(() => {
    const values = new Set<string>();
    for (const profile of this.profiles()) {
      for (const role of profile.roles ?? []) {
        const trimmed = role.trim();
        if (trimmed) {
          values.add(trimmed);
        }
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  });

  private readonly searchedProfiles = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) {
      return this.profiles();
    }
    return this.profiles().filter((profile) => profile.name.toLowerCase().includes(term));
  });

  protected readonly filteredProfiles = computed(() => {
    const domains = this.selectedDomains();
    const roles = this.selectedRoles();
    const origins = this.selectedOrigins();
    return this.searchedProfiles().filter((profile) => {
      const domainOk =
        domains.size === 0 ||
        (profile.domain_keywords ?? []).some((keyword) => domains.has(keyword.trim()));
      const roleOk =
        roles.size === 0 || (profile.roles ?? []).some((role) => roles.has(role.trim()));
      const originOk = origins.size === 0 || origins.has(ORIGIN_LABELS[profile.origin]);
      return domainOk && roleOk && originOk;
    });
  });

  constructor() {
    effect(() => {
      const packId = this.packId();
      this.reloadToken();
      void this.load(packId);
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

  protected clearFilters(): void {
    this.selectedDomains.set(new Set());
    this.selectedRoles.set(new Set());
    this.selectedOrigins.set(new Set());
  }

  protected originLabel(profile: ResolvedArtifact): string {
    if (profile.origin === 'parent') {
      return profile.source_pack_name
        ? `Inherited from ${profile.source_pack_name}`
        : ORIGIN_LABELS.parent;
    }
    return ORIGIN_LABELS[profile.origin];
  }

  /** Tooltip shown on hover/focus for the parent-origin icon badge (NFR-003: non-color-only cue). */
  protected originTooltip(profile: ResolvedArtifact): string {
    return `Inherited from ${profile.source_pack_name}`;
  }

  protected reload(): void {
    void this.load(this.packId());
  }

  /** Route to the profile's owning pack's Agent Detail page, or `null` if its record id is unknown. */
  protected profileLink(profile: ResolvedArtifact): [string, string, string, string] | null {
    const sourcePackId = profile.origin === 'own' ? this.packId() : profile.source_pack_id;
    if (!sourcePackId) {
      return null;
    }
    const recordId = this.recordIds()?.recordIdFor(profile);
    if (!recordId) {
      return null;
    }
    return ['/packs', sourcePackId, 'agents', recordId];
  }

  private async load(packId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const resolved = await this.artifactsRead.listResolved(packId);
      const profiles = resolved
        .filter((artifact) => artifact.artifact_type === 'profile')
        .sort((a, b) => a.name.localeCompare(b.name));
      this.profiles.set(profiles);

      const recordIds = await buildResolvedRecordIdIndex(
        this.artifactsRead,
        packId,
        'profile',
        profiles,
        'profiles-own-ids',
      );
      this.recordIds.set(recordIds);
    } catch (err) {
      this.profiles.set([]);
      this.recordIds.set(null);
      this.error.set(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      this.loading.set(false);
    }
  }
}
