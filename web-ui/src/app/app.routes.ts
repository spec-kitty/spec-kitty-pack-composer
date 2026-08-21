import { Routes } from '@angular/router';

import { AppShell } from './layout/app-shell';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'packs' },
      {
        path: 'packs',
        loadChildren: () =>
          import('./features/packs/packs.routes').then((m) => m.PACKS_ROUTES),
      },
      {
        path: 'charters',
        loadChildren: () =>
          import('./features/charters/charters.routes').then((m) => m.CHARTERS_ROUTES),
      },
    ],
  },
];
