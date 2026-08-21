import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { PacksApiService, PacksReadService } from '../data-access';
import type { ParentStatus, Pack, PackVersionHistory } from '../models';
import { AppBreadcrumb, type BreadcrumbItem, ErrorState, LoadingIndicator } from '../../../shared';
import { PackArtifactTabs } from './pack-artifact-tabs';
import { PackDescription } from './pack-description';
import { PackDetailHeader } from './pack-detail-header';
import { PackDetailSidebar } from './pack-detail-sidebar';

/**
 * Pack Detail page — sticky header, description, typed tabs + Raw, sidebar (FR-016–FR-025).
 * Route `/packs/:id` is declared by WP06; this page is the target component.
 */
@Component({
  selector: 'app-pack-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AppBreadcrumb,
    HlmButtonImports,
    ErrorState,
    LoadingIndicator,
    PackDetailHeader,
    PackDescription,
    PackArtifactTabs,
    PackDetailSidebar,
  ],
  host: {
    class: 'block',
  },
  template: `
    @if (loading() && !pack()) {
      <div class="flex justify-center py-16">
        <app-loading-indicator label="Loading pack" />
      </div>
    } @else if (!pack() && error(); as err) {
      <div class="space-y-4 py-8">
        <app-error-state [message]="err" (retry)="onRetry()" />
        <div class="flex justify-center">
          <a hlmBtn variant="outline" routerLink="/packs">Back to packs</a>
        </div>
      </div>
    } @else if (pack(); as current) {
      @if (error(); as err) {
        <p class="text-destructive mb-4 text-sm" role="alert">{{ err }}</p>
      }

      <app-breadcrumb [items]="breadcrumbItems()" class="mb-4 block" />

      <app-pack-detail-header
        [pack]="current"
        [refreshing]="refreshing()"
        [parentStatus]="parentStatus()"
        (refresh)="onRefresh()"
      />

      <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div class="min-w-0 space-y-6 lg:col-span-9">
          <app-pack-description [description]="current.description" />
          <app-pack-artifact-tabs [pack]="current" [reloadToken]="reloadToken()" />
        </div>

        <aside class="lg:col-span-3" aria-label="Pack details sidebar">
          <app-pack-detail-sidebar [pack]="current" [versions]="versions()" />
        </aside>
      </div>

      @if (refreshing()) {
        <div class="sr-only" aria-live="polite">Refreshing pack from disk…</div>
      }
    }
  `,
})
export class PackDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly packsRead = inject(PacksReadService);
  private readonly packsApi = inject(PacksApiService);

  private readonly packId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  protected readonly pack = signal<Pack | null>(null);
  protected readonly versions = signal<PackVersionHistory[]>([]);
  /** Fetched independently of `loadDetail` (FR-003/FR-009); missing/failed lookups are non-fatal. */
  protected readonly parentStatus = signal<ParentStatus | null>(null);
  protected readonly loading = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reloadToken = signal(0);

  protected readonly breadcrumbItems = computed((): BreadcrumbItem[] => {
    const current = this.pack();
    return [
      { label: 'Packs', routerLink: ['/packs'] },
      ...(current ? [{ label: current.name }] : []),
    ];
  });

  constructor() {
    effect(() => {
      const id = this.packId();
      if (id) {
        void this.loadDetail(id);
      } else {
        this.error.set('Missing pack id in route.');
        this.pack.set(null);
      }
    });
  }

  protected onRetry(): void {
    const id = this.packId();
    if (id) {
      void this.loadDetail(id);
    }
  }

  protected async onRefresh(): Promise<void> {
    const id = this.packId();
    if (!id || this.refreshing()) {
      return;
    }

    this.refreshing.set(true);
    this.error.set(null);
    try {
      await this.packsApi.refreshPack(id);
      await this.loadDetail(id, { quiet: true });
      this.reloadToken.update((token) => token + 1);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to refresh pack');
    } finally {
      this.refreshing.set(false);
    }
  }

  private async loadDetail(id: string, options: { quiet?: boolean } = {}): Promise<void> {
    if (!options.quiet) {
      this.loading.set(true);
    }
    this.error.set(null);
    try {
      const [pack, versions] = await Promise.all([
        this.packsRead.get(id),
        this.packsRead.listVersionHistory(id),
      ]);
      this.pack.set(pack);
      this.versions.set(versions);
      void this.loadParentStatus(id);
    } catch (err) {
      if (!options.quiet) {
        this.pack.set(null);
        this.versions.set([]);
      }
      this.error.set(err instanceof Error ? err.message : 'Failed to load pack');
    } finally {
      if (!options.quiet) {
        this.loading.set(false);
      }
    }
  }

  /**
   * Fetched separately from `loadDetail`'s `Promise.all` so a chain-status lookup
   * failure never blocks rendering the pack itself — the banner is best-effort.
   */
  private async loadParentStatus(id: string): Promise<void> {
    try {
      const statusByPackId = await this.packsApi.getParentStatus();
      this.parentStatus.set(statusByPackId[id] ?? null);
    } catch {
      this.parentStatus.set(null);
    }
  }
}
