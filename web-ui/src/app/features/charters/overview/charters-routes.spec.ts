import type { Route } from '@angular/router';

import { CHARTERS_ROUTES } from '../charters.routes';
import { CharterOverviewPage } from './charter-overview.page';

async function loadRouteComponent(route: Route): Promise<unknown> {
  const load = route.loadComponent as () => Promise<unknown>;
  expect(typeof load).toBe('function');
  return load();
}

describe('CHARTERS_ROUTES (T045)', () => {
  it('declares the overview route plus the WP12 :id detail route (FR-001/FR-013)', () => {
    expect(CHARTERS_ROUTES.map((route) => route.path)).toEqual(['', ':id']);
  });

  it('lazy-loads the overview page at the charters nav target', async () => {
    const component = await loadRouteComponent(CHARTERS_ROUTES[0]);

    expect(component).toBe(CharterOverviewPage);
  });
});
