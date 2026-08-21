import { Component } from '@angular/core';

/**
 * Temporary Pack route content owned by WP04 until WP06 delivers packs.routes feature pages.
 */
@Component({
  selector: 'app-packs-placeholder',
  host: {
    class: 'block',
  },
  template: `
    <section aria-labelledby="packs-placeholder-heading" class="space-y-2">
      <h1 id="packs-placeholder-heading" class="text-2xl font-semibold tracking-tight">
        Packs
      </h1>
      <p class="text-muted-foreground text-sm">
        Pack management pages will appear here.
      </p>
    </section>
  `,
})
export class PacksPlaceholder {}
