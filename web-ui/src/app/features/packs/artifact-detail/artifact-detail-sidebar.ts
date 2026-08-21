import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmCardImports } from '@spartan-ng/helm/card';

import type { PackArtifact } from '../models';

/**
 * Generic identity sidebar card shared by all 8 new artifact detail pages:
 * artifact id, category (when present), source file, and a link back to the
 * owning pack's Detail page. Intentionally simpler than `AgentDetailSidebar`
 * — no per-type fields such as schema version or routing metadata.
 */
@Component({
  selector: 'app-artifact-detail-sidebar',
  imports: [HlmCardImports, RouterLink],
  host: {
    class: 'flex flex-col gap-4',
  },
  template: `
    <section hlmCard>
      <div hlmCardHeader>
        <h2 hlmCardTitle>Identity</h2>
        <p hlmCardDescription>Artifact identity and routing metadata</p>
      </div>
      <div hlmCardContent>
        <dl class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Artifact ID</dt>
            <dd class="font-mono font-medium">{{ artifact().artifact_id }}</dd>
          </div>
          @if (category(); as category) {
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">Category</dt>
              <dd class="font-medium">{{ category }}</dd>
            </div>
          }
          <div class="flex flex-col gap-1">
            <dt class="text-muted-foreground">Source file</dt>
            <dd class="font-mono text-xs break-all">{{ artifact().source_relative_path }}</dd>
          </div>
        </dl>
        <a
          class="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
          [routerLink]="['/packs', packId()]"
        >
          ← Back to {{ packName() || 'pack' }}
        </a>
      </div>
    </section>
  `,
})
export class ArtifactDetailSidebar {
  readonly artifact = input.required<PackArtifact>();
  readonly packId = input.required<string>();
  readonly packName = input<string | undefined>(undefined);

  protected readonly category = computed(() => this.artifact().category);
}
