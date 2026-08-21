import { Routes } from '@angular/router';

/**
 * Pack feature routes.
 * Overview is owned by WP06; pack detail component path is owned by WP07;
 * the nested agent profile detail route (`:id/agents/:profileId`) is owned by WP05.
 * The 8 nested artifact detail routes below (`:id/<type>/:artifactId`) are owned by
 * this mission's WP08 — all lazy-load the same `ArtifactDetailPage`.
 */
export const PACKS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./overview/pack-overview.page').then((m) => m.PackOverviewPage),
  },
  {
    path: ':id',
    loadComponent: () => import('./detail/pack-detail.page').then((m) => m.PackDetailPage),
  },
  {
    path: ':id/agents/:profileId',
    loadComponent: () => import('./agent-detail/agent-detail.page').then((m) => m.AgentDetailPage),
  },
  {
    path: ':id/directives/:artifactId',
    loadComponent: () =>
      import('./artifact-detail/artifact-detail.page').then((m) => m.ArtifactDetailPage),
  },
  {
    path: ':id/tactics/:artifactId',
    loadComponent: () =>
      import('./artifact-detail/artifact-detail.page').then((m) => m.ArtifactDetailPage),
  },
  {
    path: ':id/procedures/:artifactId',
    loadComponent: () =>
      import('./artifact-detail/artifact-detail.page').then((m) => m.ArtifactDetailPage),
  },
  {
    path: ':id/styleguides/:artifactId',
    loadComponent: () =>
      import('./artifact-detail/artifact-detail.page').then((m) => m.ArtifactDetailPage),
  },
  {
    path: ':id/toolguides/:artifactId',
    loadComponent: () =>
      import('./artifact-detail/artifact-detail.page').then((m) => m.ArtifactDetailPage),
  },
  {
    path: ':id/mission-step-contracts/:artifactId',
    loadComponent: () =>
      import('./artifact-detail/artifact-detail.page').then((m) => m.ArtifactDetailPage),
  },
  {
    path: ':id/templates/:artifactId',
    loadComponent: () =>
      import('./artifact-detail/artifact-detail.page').then((m) => m.ArtifactDetailPage),
  },
  {
    path: ':id/glossary/:artifactId',
    loadComponent: () =>
      import('./artifact-detail/artifact-detail.page').then((m) => m.ArtifactDetailPage),
  },
];
