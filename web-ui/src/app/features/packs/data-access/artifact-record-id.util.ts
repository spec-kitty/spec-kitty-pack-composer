import type { ArtifactType, ResolvedArtifact } from '../models';
import type { ArtifactsReadService } from './artifacts-read.service';

/** Lookup built by {@link buildResolvedRecordIdIndex}. */
export interface ResolvedRecordIdIndex {
  /**
   * Resolve a `ResolvedArtifact` to the PocketBase record id of the `pack_artifacts`
   * row it originated from, or `null` if that source pack or record is unknown
   * (e.g. a `built-in` artifact with no per-pack record in some source packs).
   */
  recordIdFor(
    artifact: Pick<ResolvedArtifact, 'origin' | 'source_pack_id' | 'artifact_id'>,
  ): string | null;
}

/**
 * Build an origin-aware (own/parent/built-in) index from `ResolvedArtifact.artifact_id`
 * to the PocketBase record id of the `pack_artifacts` row it came from.
 *
 * `ResolvedArtifact` (sourced from `/resolved`) has no PocketBase record `id` — only
 * `artifact_id` — but per-artifact detail routes are keyed by record id. This runs one
 * `listByPackAndType` call per distinct source pack referenced among `resolvedArtifacts`
 * (the owning pack itself, plus every `source_pack_id` among inherited/built-in artifacts),
 * in parallel, to build a `sourcePackId -> artifact_id -> record id` lookup.
 *
 * Each parallel call is given a distinct `requestKey` (`${requestKeyPrefix}:${sourcePackId}`)
 * because PocketBase auto-cancels concurrent requests that share a request key; without this,
 * concurrent per-source-pack fetches would cancel each other and surface as
 * "The request was aborted" errors. Callers must pass a `requestKeyPrefix` that is distinct
 * from any other caller's, so two callers running concurrently (e.g. `PackProfilesTab` and
 * `PackArtifactTable`) never collide on each other's request keys either.
 */
export async function buildResolvedRecordIdIndex(
  artifactsRead: ArtifactsReadService,
  ownPackId: string,
  artifactType: ArtifactType,
  resolvedArtifacts: readonly ResolvedArtifact[],
  requestKeyPrefix: string,
): Promise<ResolvedRecordIdIndex> {
  const sourcePackIds = new Set<string>([ownPackId]);
  for (const artifact of resolvedArtifacts) {
    if (artifact.origin !== 'own' && artifact.source_pack_id) {
      sourcePackIds.add(artifact.source_pack_id);
    }
  }

  const settled = await Promise.allSettled(
    [...sourcePackIds].map(async (sourcePackId): Promise<[string, Map<string, string>]> => {
      const result = await artifactsRead.listByPackAndType(
        sourcePackId,
        artifactType,
        {},
        // Distinct requestKey per source pack — these calls run concurrently and would
        // otherwise auto-cancel each other (PocketBase default request key ignores query
        // params), surfacing as "The request was aborted" (FR-011/FR-013 regression).
        { perPage: 500, requestKey: `${requestKeyPrefix}:${sourcePackId}` },
      );
      return [sourcePackId, new Map(result.items.map((item) => [item.artifact_id, item.id]))];
    }),
  );
  // Isolate per-source-pack failures: a single source pack's fetch rejecting must only
  // omit that pack's entries (its artifacts then resolve to `null` via `recordIdFor()`),
  // not throw and take down the whole index for every other source pack.
  const entries: [string, Map<string, string>][] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      entries.push(result.value);
    } else {
      console.error('buildResolvedRecordIdIndex: a source pack fetch failed', result.reason);
    }
  }
  const recordIdsByPack = new Map(entries);

  return {
    recordIdFor(artifact): string | null {
      const sourcePackId = artifact.origin === 'own' ? ownPackId : artifact.source_pack_id;
      if (!sourcePackId) {
        return null;
      }
      return recordIdsByPack.get(sourcePackId)?.get(artifact.artifact_id) ?? null;
    },
  };
}
