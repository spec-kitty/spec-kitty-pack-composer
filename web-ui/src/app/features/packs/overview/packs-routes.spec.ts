import type { Route } from '@angular/router';

import { PACKS_ROUTES } from '../packs.routes';
import { PackOverviewPage } from './pack-overview.page';

async function loadRouteComponent(route: Route): Promise<unknown> {
  const load = route.loadComponent as () => Promise<unknown>;
  expect(typeof load).toBe('function');
  return load();
}

describe('PACKS_ROUTES (T035 / T019)', () => {
  it('declares the overview route, a :id detail route, the nested agent profile route, and the 8 nested artifact detail routes (FR-001)', () => {
    expect(PACKS_ROUTES.map((route) => route.path)).toEqual([
      '',
      ':id',
      ':id/agents/:profileId',
      ':id/directives/:artifactId',
      ':id/tactics/:artifactId',
      ':id/procedures/:artifactId',
      ':id/styleguides/:artifactId',
      ':id/toolguides/:artifactId',
      ':id/mission-step-contracts/:artifactId',
      ':id/templates/:artifactId',
      ':id/glossary/:artifactId',
    ]);
  });

  it('lazy-loads the overview page at the pack nav target', async () => {
    const component = await loadRouteComponent(PACKS_ROUTES[0]);

    expect(component).toBe(PackOverviewPage);
  });

  it('lazy-loads a detail component for /packs/:id', async () => {
    const component = await loadRouteComponent(PACKS_ROUTES[1]);

    expect(typeof component).toBe('function');
    expect((component as { name: string }).name).toMatch(/PackDetailPage$/);
  });

  it('lazy-loads the agent detail page for /packs/:id/agents/:profileId (FR-001)', async () => {
    const component = await loadRouteComponent(PACKS_ROUTES[2]);

    expect(typeof component).toBe('function');
    expect((component as { name: string }).name).toMatch(/AgentDetailPage$/);
  });

  it('lazy-loads ArtifactDetailPage from the same import path for all 8 new nested routes (FR-001)', async () => {
    const artifactRoutes = PACKS_ROUTES.slice(3);
    expect(artifactRoutes).toHaveLength(8);

    for (const route of artifactRoutes) {
      const component = await loadRouteComponent(route);
      expect(typeof component).toBe('function');
      expect((component as { name: string }).name).toMatch(/ArtifactDetailPage$/);
    }
  });
});
