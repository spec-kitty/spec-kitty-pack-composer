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
import { AgentDetailHeader } from './agent-detail-header';
import { AgentDetailSidebar } from './agent-detail-sidebar';
import { AgentDetailTextSection } from './agent-detail-text-section';
import { AgentSectionTabs } from './agent-section-tabs';
import { getProfileDescription, getProfilePurpose } from './agent-section-types';

/**
 * Agent Profile Detail page — breadcrumb, header, parse-error banner, description,
 * purpose, section tabs, and identity sidebar for a single profile artifact
 * (FR-001, FR-002, FR-004–FR-007, FR-010–FR-015).
 * Route `/packs/:id/agents/:profileId` is declared by this WP alongside this page.
 */
@Component({
  selector: 'app-agent-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmButtonImports,
    ErrorState,
    LoadingIndicator,
    AppBreadcrumb,
    AgentDetailHeader,
    AgentDetailTextSection,
    AgentSectionTabs,
    AgentDetailSidebar,
  ],
  host: {
    class: 'block',
  },
  template: `
    @if (loading() && !profile()) {
      <div class="flex justify-center py-16">
        <app-loading-indicator label="Loading profile" />
      </div>
    } @else if (!profile() && error(); as err) {
      <div class="space-y-4 py-8">
        <app-error-state [message]="err" (retry)="onRetry()" />
        <div class="flex justify-center">
          <a hlmBtn variant="outline" routerLink="/packs">Back to packs</a>
        </div>
      </div>
    } @else if (pack(); as currentPack) {
      @if (profile(); as currentProfile) {
        @if (error(); as err) {
          <p class="text-destructive mb-4 text-sm" role="alert">{{ err }}</p>
        }

        <app-breadcrumb [items]="breadcrumbItems()" class="mb-4 block" />

        <app-agent-detail-header
          [profile]="currentProfile"
          [refreshing]="refreshing()"
          (refresh)="onRefresh()"
        />

        @if (!currentProfile.parse_ok) {
          <div
            class="border-destructive/50 bg-destructive/10 text-destructive mt-4 rounded-lg border px-4 py-3 text-sm"
            role="alert"
          >
            <p class="font-medium">This profile failed to parse.</p>
            @if (currentProfile.parse_error) {
              <p class="mt-1 font-mono text-xs">{{ currentProfile.parse_error }}</p>
            }
          </div>
        }

        <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div class="min-w-0 space-y-6 lg:col-span-9">
            <app-agent-detail-text-section
              heading="Description"
              [description]="getProfileDescription(currentProfile.content)"
            />
            <app-agent-detail-text-section
              heading="Purpose"
              [description]="getProfilePurpose(currentProfile.content)"
            />
            <app-agent-section-tabs [content]="currentProfile.content" />
          </div>

          <aside class="lg:col-span-3" aria-label="Profile details sidebar">
            <app-agent-detail-sidebar
              [profile]="currentProfile"
              [packId]="currentPack.id"
              [packName]="currentPack.name"
            />
          </aside>
        </div>

        @if (refreshing()) {
          <div class="sr-only" aria-live="polite">Refreshing profile from disk…</div>
        }
      }
    }
  `,
})
export class AgentDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly packsRead = inject(PacksReadService);
  private readonly packsApi = inject(PacksApiService);
  private readonly artifactsRead = inject(ArtifactsReadService);

  private readonly packId = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });
  private readonly profileId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('profileId'))),
    { initialValue: this.route.snapshot.paramMap.get('profileId') },
  );

  protected readonly pack = signal<Pack | null>(null);
  protected readonly profile = signal<PackArtifact | null>(null);
  protected readonly loading = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly breadcrumbItems = computed((): BreadcrumbItem[] => {
    const currentPack = this.pack();
    const currentProfile = this.profile();
    return [
      { label: 'Packs', routerLink: ['/packs'] },
      ...(currentPack ? [{ label: currentPack.name, routerLink: ['/packs', currentPack.id] }] : []),
      ...(currentProfile ? [{ label: currentProfile.name }] : []),
    ];
  });

  protected readonly getProfileDescription = getProfileDescription;
  protected readonly getProfilePurpose = getProfilePurpose;

  constructor() {
    effect(() => {
      const packId = this.packId();
      const profileId = this.profileId();
      if (packId && profileId) {
        void this.loadDetail(packId, profileId);
      } else {
        this.error.set('Missing pack or profile id in route.');
        this.pack.set(null);
        this.profile.set(null);
      }
    });
  }

  protected onRetry(): void {
    const packId = this.packId();
    const profileId = this.profileId();
    if (packId && profileId) {
      void this.loadDetail(packId, profileId);
    }
  }

  protected async onRefresh(): Promise<void> {
    const packId = this.packId();
    const profileId = this.profileId();
    if (!packId || !profileId || this.refreshing()) {
      return;
    }

    this.refreshing.set(true);
    this.error.set(null);
    try {
      await this.packsApi.refreshPack(packId);
      await this.loadDetail(packId, profileId, { quiet: true });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to refresh profile');
    } finally {
      this.refreshing.set(false);
    }
  }

  private async loadDetail(
    packId: string,
    profileId: string,
    options: { quiet?: boolean } = {},
  ): Promise<void> {
    if (!options.quiet) {
      this.loading.set(true);
    }
    this.error.set(null);
    try {
      const [pack, profile] = await Promise.all([
        this.packsRead.get(packId),
        this.artifactsRead.get(profileId),
      ]);
      this.pack.set(pack);
      this.profile.set(profile);
    } catch (err) {
      if (!options.quiet) {
        this.pack.set(null);
        this.profile.set(null);
      }
      this.error.set(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      if (!options.quiet) {
        this.loading.set(false);
      }
    }
  }
}
