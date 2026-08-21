import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw } from '@ng-icons/lucide';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';

import type { Pack, ParentStatus } from '../models';
import { formatOrigin, formatValidationStatus } from './artifact-types';

/**
 * Sticky pack detail header — name, version/origin/validation badges,
 * last-updated timestamp, and refresh action (FR-016, FR-023).
 */
@Component({
  selector: 'app-pack-detail-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, HlmAlertImports, HlmBadgeImports, HlmButtonImports, NgIcon],
  providers: [provideIcons({ lucideRefreshCw })],
  host: {
    class:
      'border-border bg-background/95 sticky top-14 z-30 -mx-4 block border-b px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80',
  },
  template: `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1 space-y-2">
        <h1 class="text-foreground truncate text-xl font-semibold tracking-tight">
          {{ pack().name }}
        </h1>
        <div class="flex flex-wrap items-center gap-2" aria-label="Pack badges">
          @if (pack().project_key; as projectKey) {
            <span
              hlmBadge
              variant="outline"
              class="font-mono"
              [attr.aria-label]="'Project key ' + projectKey"
            >
              {{ projectKey }}
            </span>
          }
          <span hlmBadge variant="secondary" [attr.aria-label]="'Version ' + pack().version">
            v{{ pack().version }}
          </span>
          <span hlmBadge variant="outline" [attr.aria-label]="'Origin ' + originLabel()">
            {{ originLabel() }}
          </span>
          <span
            hlmBadge
            [variant]="validationBadgeVariant()"
            [attr.aria-label]="'Validation ' + validationLabel()"
          >
            {{ validationLabel() }}
          </span>
          <span class="text-muted-foreground text-sm">
            Updated
            <time [attr.datetime]="pack().updated_at">
              {{ pack().updated_at | date: 'medium' }}
            </time>
          </span>
        </div>

        @if (isBroken()) {
          <div hlmAlert variant="destructive" class="mt-3" role="alert">
            <h3 hlmAlertTitle>Inherited data is incomplete</h3>
            <p hlmAlertDescription>{{ brokenMessage() }}</p>
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
export class PackDetailHeader {
  readonly pack = input.required<Pack>();
  readonly refreshing = input(false);
  /** Chain-resolution status for this pack (FR-003/FR-009); null while unknown/loading. */
  readonly parentStatus = input<ParentStatus | null>(null);
  readonly refresh = output<void>();

  protected isBroken(): boolean {
    const status = this.parentStatus()?.status;
    return status === 'missing' || status === 'broken-ancestor';
  }

  protected brokenMessage(): string {
    const status = this.parentStatus();
    const name = status?.broken_pack_name ?? status?.broken_ref ?? 'a parent pack';
    if (status?.status === 'missing') {
      return `This pack's parent pack "${name}" could not be found. Directives, tactics, and other artifacts inherited from it are not shown, so the data below may be incomplete.`;
    }
    return `An ancestor in this pack's parent chain, "${name}", is missing or broken. Inherited data shown below may be incomplete.`;
  }

  protected originLabel(): string {
    return formatOrigin(this.pack().origin);
  }

  protected validationLabel(): string {
    return formatValidationStatus(this.pack().validation_status);
  }

  protected validationBadgeVariant(): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (this.pack().validation_status) {
      case 'valid':
        return 'default';
      case 'errors':
        return 'destructive';
      default:
        return 'outline';
    }
  }
}
