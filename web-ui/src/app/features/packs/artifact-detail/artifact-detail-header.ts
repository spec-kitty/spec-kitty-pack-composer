import { Component, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import type { PackArtifact } from '../models';
import { AddToCharterControl, InCharterBadge } from '../shared';

/**
 * Sticky, generic detail-page header shared by all 8 new artifact detail
 * pages: artifact name and a Refresh action (FR-004). Unlike
 * `AgentDetailHeader`, this header carries no badge sections beyond the
 * charter membership indicator (FR-007) — it is otherwise intentionally
 * type-agnostic.
 */
@Component({
  selector: 'app-artifact-detail-header',
  imports: [HlmButtonImports, NgIcon, AddToCharterControl, InCharterBadge],
  providers: [provideIcons({ lucideRefreshCw })],
  host: {
    class:
      'border-border bg-background/95 sticky top-14 z-30 -mx-4 block border-b px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80',
  },
  template: `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h1 class="text-foreground truncate text-xl font-semibold tracking-tight">
          {{ artifact().name }}
        </h1>
        <div class="mt-1.5 flex flex-wrap items-center gap-2">
          <app-in-charter-badge [inCharter]="inCharter()" />
          <app-add-to-charter-control
            [artifactType]="artifact().artifact_type"
            [artifactId]="artifact().artifact_id"
            [packArtifactId]="artifact().id"
            [artifactName]="artifact().name"
            (membershipResolved)="inCharter.set($event)"
          />
        </div>
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
export class ArtifactDetailHeader {
  readonly artifact = input.required<PackArtifact>();
  readonly refreshing = input(false);
  readonly refresh = output<void>();

  /** Driven by `AddToCharterControl`'s `membershipResolved` output — see FR-007. */
  protected readonly inCharter = signal(false);
}
