import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { map } from 'rxjs/operators';

import { ArtifactsReadService, PacksApiService, PacksReadService } from '../data-access';
import type { Pack, PackArtifact } from '../models';
import { AppBreadcrumb, ErrorState, LoadingIndicator } from '../../../shared';
import type { BreadcrumbItem } from '../../../shared';
import { ArtifactDetailHeader } from './artifact-detail-header';
import { ArtifactDetailSidebar } from './artifact-detail-sidebar';
import { ArtifactDetailTabs } from './artifact-detail-tabs';

/**
 * Shared Artifact Detail page for all 8 non-profile artifact types — breadcrumb,
 * sticky header, parse-error banner, Details/Raw tabs, and identity sidebar
 * (FR-001, FR-003, FR-004, FR-015–FR-020). Backs all 8 nested routes declared
 * alongside this page in `packs.routes.ts`. Deliberately simpler than
 * `AgentDetailPage`: uniform 2-tab shell, no description/purpose sections
 * (research.md R5).
 */
@Component({
  selector: 'app-artifact-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmButtonImports,
    ErrorState,
    LoadingIndicator,
    AppBreadcrumb,
    ArtifactDetailHeader,
    ArtifactDetailTabs,
    ArtifactDetailSidebar,
  ],
  host: {
    class: 'block',
  },
  template: `
    @if (loading() && !artifact()) {
      <div class="flex justify-center py-16">
        <app-loading-indicator label="Loading artifact" />
      </div>
    } @else if (!artifact() && error(); as err) {
      <div class="space-y-4 py-8">
        <app-error-state [message]="err" (retry)="onRetry()" />
        <div class="flex justify-center">
          <a hlmBtn variant="outline" routerLink="/packs">Back to packs</a>
        </div>
      </div>
    } @else if (pack(); as currentPack) {
      @if (artifact(); as currentArtifact) {
        @if (error(); as err) {
          <p class="text-destructive mb-4 text-sm" role="alert">{{ err }}</p>
        }

        <app-breadcrumb [items]="breadcrumbItems()" class="mb-4 block" />

        <app-artifact-detail-header
          [artifact]="currentArtifact"
          [refreshing]="refreshing()"
          (refresh)="onRefresh()"
        />

        @if (!currentArtifact.parse_ok) {
          <div
            class="border-destructive/50 bg-destructive/10 text-destructive mt-4 rounded-lg border px-4 py-3 text-sm"
            role="alert"
          >
            <p class="font-medium">This artifact failed to parse.</p>
            @if (currentArtifact.parse_error) {
              <p class="mt-1 font-mono text-xs">{{ currentArtifact.parse_error }}</p>
            }
          </div>
        }

        <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div class="min-w-0 space-y-6 lg:col-span-9">
            <app-artifact-detail-tabs
              [artifactType]="currentArtifact.artifact_type"
              [content]="currentArtifact.content"
              [packId]="currentPack.id"
            />
          </div>

          <aside class="lg:col-span-3" aria-label="Artifact details sidebar">
            <app-artifact-detail-sidebar
              [artifact]="currentArtifact"
              [packId]="currentPack.id"
              [packName]="currentPack.name"
            />
          </aside>
        </div>

        @if (refreshing()) {
          <div class="sr-only" aria-live="polite">Refreshing artifact from disk…</div>
        }
      }
    }
  `,
})
export class ArtifactDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly packsRead = inject(PacksReadService);
  private readonly packsApi = inject(PacksApiService);
  private readonly artifactsRead = inject(ArtifactsReadService);

  private readonly packId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });
  private readonly artifactId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('artifactId'))),
    { initialValue: this.route.snapshot.paramMap.get('artifactId') },
  );

  protected readonly pack = signal<Pack | null>(null);
  protected readonly artifact = signal<PackArtifact | null>(null);
  protected readonly loading = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly breadcrumbItems = computed((): BreadcrumbItem[] => {
    const currentPack = this.pack();
    const currentArtifact = this.artifact();
    return [
      { label: 'Packs', routerLink: ['/packs'] },
      ...(currentPack ? [{ label: currentPack.name, routerLink: ['/packs', currentPack.id] }] : []),
      ...(currentArtifact ? [{ label: currentArtifact.name }] : []),
    ];
  });

  constructor() {
    effect(() => {
      const packId = this.packId();
      const artifactId = this.artifactId();
      if (packId && artifactId) {
        void this.loadDetail(packId, artifactId);
      } else {
        this.error.set('Missing pack or artifact id in route.');
        this.pack.set(null);
        this.artifact.set(null);
      }
    });
  }

  protected onRetry(): void {
    const packId = this.packId();
    const artifactId = this.artifactId();
    if (packId && artifactId) {
      void this.loadDetail(packId, artifactId);
    }
  }

  protected async onRefresh(): Promise<void> {
    const packId = this.packId();
    const artifactId = this.artifactId();
    if (!packId || !artifactId || this.refreshing()) {
      return;
    }

    this.refreshing.set(true);
    this.error.set(null);
    try {
      await this.packsApi.refreshPack(packId);
      await this.loadDetail(packId, artifactId, { quiet: true });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to refresh artifact');
    } finally {
      this.refreshing.set(false);
    }
  }

  private async loadDetail(
    packId: string,
    artifactId: string,
    options: { quiet?: boolean } = {},
  ): Promise<void> {
    if (!options.quiet) {
      this.loading.set(true);
    }
    this.error.set(null);
    try {
      const [pack, artifact] = await Promise.all([
        this.packsRead.get(packId),
        this.artifactsRead.get(artifactId),
      ]);
      this.pack.set(pack);
      this.artifact.set(artifact);
    } catch (err) {
      if (!options.quiet) {
        this.pack.set(null);
        this.artifact.set(null);
      }
      this.error.set(err instanceof Error ? err.message : 'Failed to load artifact');
    } finally {
      if (!options.quiet) {
        this.loading.set(false);
      }
    }
  }
}
