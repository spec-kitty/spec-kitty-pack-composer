import { Component, input } from '@angular/core';
import { HlmBreadcrumbImports } from '@spartan-ng/helm/breadcrumb';

export interface BreadcrumbItem {
  label: string;
  /** Omit or leave undefined for the current (last) page — it never renders as a link regardless. */
  routerLink?: string[];
}

/**
 * Generic breadcrumb trail (FR-003) built on the vendored spartan/ui breadcrumb
 * primitives (NFR-002). The last item always renders as the current, non-link page —
 * this is enforced by the component regardless of what callers pass in `items`.
 *
 * Intentionally free of any pack-domain types so it can be reused by both the Pack
 * Detail page and the Agent Profile Detail page.
 */
@Component({
  selector: 'app-breadcrumb',
  imports: [HlmBreadcrumbImports],
  template: `
    <nav hlmBreadcrumb aria-label="Breadcrumb">
      <ol hlmBreadcrumbList>
        @for (item of items(); track item.label + $index; let last = $last) {
          <li hlmBreadcrumbItem>
            @if (!last && item.routerLink) {
              <a hlmBreadcrumbLink [link]="item.routerLink">{{ item.label }}</a>
            } @else {
              <span hlmBreadcrumbPage>{{ item.label }}</span>
            }
          </li>
          @if (!last) {
            <li hlmBreadcrumbSeparator></li>
          }
        }
      </ol>
    </nav>
  `,
})
export class AppBreadcrumb {
  readonly items = input.required<BreadcrumbItem[]>();
}
