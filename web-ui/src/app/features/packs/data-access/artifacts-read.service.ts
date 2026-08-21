import { Service, inject } from '@angular/core';
import type { ListResult, RecordModel } from 'pocketbase';

import type { ArtifactListFilters, ArtifactType, PackArtifact, ResolvedArtifact } from '../models';
import { PacksApiService } from './packs-api.service';
import { escapePocketBaseFilterValue, joinFilters } from './pocketbase-filter.util';
import { PocketBaseClient } from './pocketbase.client';

const ARTIFACTS_COLLECTION = 'pack_artifacts';

export interface ArtifactListOptions {
  page?: number;
  perPage?: number;
  /**
   * PocketBase auto-cancels concurrent requests that share a request key (by default
   * derived from the HTTP method + URL). Callers that intentionally fire several
   * `listByPackAndType` calls in parallel (e.g. one per ancestor pack) must pass a
   * distinct key per call, or `null` to opt that call out of auto-cancellation entirely.
   */
  requestKey?: string | null;
}

@Service()
export class ArtifactsReadService {
  private readonly pb = inject(PocketBaseClient).pb;
  private readonly packsApi = inject(PacksApiService);

  async list(
    filters: ArtifactListFilters,
    options: ArtifactListOptions = {},
  ): Promise<ListResult<PackArtifact>> {
    const filter = buildArtifactListFilter(filters);
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 200;
    const sort = filters.sort ?? defaultSortForType(filters.artifactType);

    return this.pb
      .collection(ARTIFACTS_COLLECTION)
      .getList<PackArtifact & RecordModel>(page, perPage, {
        filter,
        sort,
        requestKey: options.requestKey,
      });
  }

  async listByPackAndType(
    packId: string,
    artifactType: ArtifactType,
    facetFilters: Omit<ArtifactListFilters, 'packId' | 'artifactType'> = {},
    options: ArtifactListOptions = {},
  ): Promise<ListResult<PackArtifact>> {
    return this.list({ packId, artifactType, ...facetFilters }, options);
  }

  async get(id: string): Promise<PackArtifact> {
    return this.pb.collection(ARTIFACTS_COLLECTION).getOne<PackArtifact & RecordModel>(id);
  }

  /** Full effective artifact set (own + inherited) for a pack, via GET /{packId}/resolved. */
  async listResolved(packId: string): Promise<ResolvedArtifact[]> {
    const resolved = await this.packsApi.getResolved(packId);
    return resolved.artifacts;
  }
}

export function buildArtifactListFilter(filters: ArtifactListFilters): string {
  const name = filters.name?.trim();
  const roles = filters.rolesContains?.trim();
  const keywords = filters.domainKeywordsContains?.trim();

  return joinFilters([
    `pack = "${escapePocketBaseFilterValue(filters.packId)}"`,
    `artifact_type = "${escapePocketBaseFilterValue(filters.artifactType)}"`,
    name ? `name ~ "${escapePocketBaseFilterValue(name)}"` : undefined,
    roles ? `roles ?= "${escapePocketBaseFilterValue(roles)}"` : undefined,
    keywords ? `domain_keywords ?= "${escapePocketBaseFilterValue(keywords)}"` : undefined,
  ]);
}

function defaultSortForType(artifactType: ArtifactType): string {
  return artifactType === 'profile' ? 'name' : 'name';
}
