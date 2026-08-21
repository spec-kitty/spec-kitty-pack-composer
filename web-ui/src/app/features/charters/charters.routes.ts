import { Routes } from '@angular/router';

/**
 * Charters feature routes.
 * Overview (`''`) is owned by this mission's WP09; the `:id` detail grid route below
 * is owned by WP12 (Charter Detail Grid UI), which depends on WP09. Mirrors the
 * overview/detail route-ownership split documented in `packs.routes.ts`.
 */
export const CHARTERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./overview/charter-overview.page').then((m) => m.CharterOverviewPage),
  },
  {
    path: ':id',
    loadComponent: () => import('./detail/charter-detail.page').then((m) => m.CharterDetailPage),
  },
];
