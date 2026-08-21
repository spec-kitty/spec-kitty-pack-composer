import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw } from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import type { PackArtifact } from '../models';
import { AddToCharterControl, InCharterBadge } from '../shared';

/**
 * Sticky agent profile header — name, domain-keyword badges (directly under
 * the title), role badges, charter membership (FR-007), and refresh action
 * (FR-004, FR-005, FR-006).
 */
@Component({
  selector: 'app-agent-detail-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports, HlmButtonImports, NgIcon, AddToCharterControl, InCharterBadge],
  providers: [provideIcons({ lucideRefreshCw })],
  host: {
    class:
      'border-border bg-background/95 sticky top-14 z-30 -mx-4 block border-b px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80',
  },
  template: `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1 space-y-2">
        <h1 class="text-foreground truncate text-xl font-semibold tracking-tight">
          {{ profile().name }}
        </h1>
        <div class="flex flex-wrap items-center gap-2">
          <app-in-charter-badge [inCharter]="inCharter()" />
          <app-add-to-charter-control
            [artifactType]="profile().artifact_type"
            [artifactId]="profile().artifact_id"
            [packArtifactId]="profile().id"
            [artifactName]="profile().name"
            (membershipResolved)="inCharter.set($event)"
          />
        </div>
        @if (domainKeywords().length > 0) {
          <div class="flex flex-wrap items-center gap-1.5" aria-label="Domain keywords">
            @for (keyword of domainKeywords(); track keyword) {
              <span hlmBadge variant="outline">{{ keyword }}</span>
            }
          </div>
        }
        @if (roles().length > 0) {
          <div class="flex flex-wrap items-center gap-1.5" aria-label="Roles">
            @for (role of roles(); track role) {
              <span hlmBadge variant="secondary">{{ role }}</span>
            }
          </div>
        }
      </div>

      <button
        type="button"
        hlmBtn
        variant="outline"
        size="sm"
        class="shrink-0"
        [disabled]="refreshing()"
        [attr.aria-busy]="refreshing()"
        (click)="refresh.emit()"
      >
        <ng-icon name="lucideRefreshCw" [class.animate-spin]="refreshing()" aria-hidden="true" />
        {{ refreshing() ? 'Refreshing…' : 'Refresh' }}
      </button>
    </div>
  `,
})
export class AgentDetailHeader {
  readonly profile = input.required<PackArtifact>();
  readonly refreshing = input(false);
  readonly refresh = output<void>();

  /** Driven by `AddToCharterControl`'s `membershipResolved` output — see FR-007. */
  protected readonly inCharter = signal(false);

  protected readonly domainKeywords = computed(() => this.profile().domain_keywords ?? []);
  protected readonly roles = computed(() => this.profile().roles ?? []);
}
