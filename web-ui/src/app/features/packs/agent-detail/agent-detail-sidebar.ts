import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmCardImports } from '@spartan-ng/helm/card';

import type { PackArtifact } from '../models';

/**
 * Identity sidebar card for the Agent Profile Detail page: profile id,
 * category, schema version, routing metadata, source file, and a link
 * back to the owning pack's Detail page (research.md R3).
 */
@Component({
  selector: 'app-agent-detail-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmCardImports, RouterLink],
  host: {
    class: 'flex flex-col gap-4',
  },
  template: `
    <section hlmCard>
      <div hlmCardHeader>
        <h2 hlmCardTitle>Identity</h2>
        <p hlmCardDescription>Profile identity and routing metadata</p>
      </div>
      <div hlmCardContent>
        <dl class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-2">
            <dt class="text-muted-foreground">Profile ID</dt>
            <dd class="font-mono font-medium">{{ profileId() }}</dd>
          </div>
          @if (category(); as category) {
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">Category</dt>
              <dd class="font-medium">{{ category }}</dd>
            </div>
          }
          @if (schemaVersion(); as version) {
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">Schema version</dt>
              <dd class="font-medium">{{ version }}</dd>
            </div>
          }
          @if (routingPriority() !== undefined) {
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">Routing priority</dt>
              <dd class="font-medium tabular-nums">{{ routingPriority() }}</dd>
            </div>
          }
          @if (maxConcurrentTasks() !== undefined) {
            <div class="flex items-center justify-between gap-2">
              <dt class="text-muted-foreground">Max concurrent tasks</dt>
              <dd class="font-medium tabular-nums">{{ maxConcurrentTasks() }}</dd>
            </div>
          }
          <div class="flex flex-col gap-1">
            <dt class="text-muted-foreground">Source file</dt>
            <dd class="font-mono text-xs break-all">{{ profile().source_relative_path }}</dd>
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
export class AgentDetailSidebar {
  readonly profile = input.required<PackArtifact>();
  readonly packId = input.required<string>();
  readonly packName = input<string | undefined>(undefined);

  protected readonly profileId = computed(
    () => this.readContentString('profile-id') ?? this.profile().artifact_id,
  );
  protected readonly category = computed(() => this.profile().category);
  protected readonly schemaVersion = computed(() => this.readContentString('schema-version'));
  protected readonly routingPriority = computed(() => this.readContentNumber('routing-priority'));
  protected readonly maxConcurrentTasks = computed(() =>
    this.readContentNumber('max-concurrent-tasks'),
  );

  private readContentString(key: string): string | undefined {
    const content = this.profile().content;
    const record =
      content && typeof content === 'object' ? (content as Record<string, unknown>) : undefined;
    const value = record?.[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private readContentNumber(key: string): number | undefined {
    const content = this.profile().content;
    const record =
      content && typeof content === 'object' ? (content as Record<string, unknown>) : undefined;
    const value = record?.[key];
    return typeof value === 'number' ? value : undefined;
  }
}
