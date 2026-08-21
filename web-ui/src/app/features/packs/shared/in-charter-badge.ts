import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

/**
 * Purely presentational "In Charter" indicator (FR-007) — reflects the active charter's
 * current membership for one artifact, independent of `AddToCharterControl`'s action label.
 * No API calls, no injected services: the parent always supplies the resolved boolean.
 */
@Component({
  selector: 'app-in-charter-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmBadgeImports],
  host: {
    class: 'inline-flex',
  },
  template: `
    @if (inCharter()) {
      <span hlmBadge variant="secondary">In Charter</span>
    }
  `,
})
export class InCharterBadge {
  readonly inCharter = input.required<boolean>();
}
