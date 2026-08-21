import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideRefreshCw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';

/**
 * Presentational empty-state UI for failed data fetches: a red alert icon + message,
 * with an optional "Retry" action for the caller to re-run its load.
 */
@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports],
  providers: [provideIcons({ lucideCircleAlert, lucideRefreshCw })],
  host: {
    class: 'block',
    role: 'alert',
  },
  template: `
    <div class="text-destructive flex flex-col items-center gap-3 rounded-md border border-dashed border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <ng-icon name="lucideCircleAlert" class="text-3xl" aria-hidden="true" />
      <p class="text-sm font-medium">{{ message() }}</p>
      @if (showRetry()) {
        <button type="button" hlmBtn variant="outline" size="sm" (click)="retry.emit()">
          <ng-icon name="lucideRefreshCw" aria-hidden="true" />
          {{ retryLabel() }}
        </button>
      }
    </div>
  `,
})
export class ErrorState {
  readonly message = input.required<string>();
  readonly showRetry = input(true);
  readonly retryLabel = input('Retry');

  readonly retry = output<void>();
}
