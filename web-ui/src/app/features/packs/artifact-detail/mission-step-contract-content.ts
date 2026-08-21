import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

import { ArtifactsReadService } from '../data-access';
import type { MissionStepContractInputView } from '../models';
import { asBoolean } from './artifact-content-types';

/**
 * Resolvable delegate target types (FR-012, C-004). A step's `delegates_to.kind`
 * may be other values (e.g. `procedure`) in the wild — those never trigger a
 * resolution attempt and always render as plain text/badge.
 */
type ResolvableDelegateKind = 'directive' | 'tactic';

function isResolvableDelegateKind(kind: string | undefined): kind is ResolvableDelegateKind {
  return kind === 'directive' || kind === 'tactic';
}

/** Structural (pre-resolution) view of one Mission Step Contract step. */
interface MissionStepContractStepRenderView {
  id: string;
  description?: string;
  command?: string;
  inputs: MissionStepContractInputView[];
  guidance?: string;
  /** `undefined` when the step has no `delegates_to` at all. */
  delegatesToKind?: string;
  delegateCandidateIds: string[];
}

interface MissionStepContractRenderView {
  action?: string;
  mission?: string;
  steps: MissionStepContractStepRenderView[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    : [];
}

function toInputView(entry: Record<string, unknown>): MissionStepContractInputView {
  return {
    flag: asNonEmptyString(entry['flag']),
    source: asNonEmptyString(entry['source']),
    optional: asBoolean(entry['optional']),
  };
}

function toStepRenderView(entry: Record<string, unknown>): MissionStepContractStepRenderView {
  const delegatesTo = asRecord(entry['delegates_to']);
  return {
    id: asNonEmptyString(entry['id']) ?? '',
    description: asNonEmptyString(entry['description']),
    command: asNonEmptyString(entry['command']),
    inputs: asRecordArray(entry['inputs']).map(toInputView),
    guidance: asNonEmptyString(entry['guidance']),
    delegatesToKind: asNonEmptyString(delegatesTo?.['kind']),
    delegateCandidateIds: asStringArray(delegatesTo?.['candidates']),
  };
}

/**
 * Pure `content -> view` transform (FR-011), analogous to WP02's other typed
 * accessors — but kept local to this file since it also needs to preserve
 * each step's raw `delegatesToKind` (used by `resolveLink`), which the
 * published `MissionStepContractStepView` shape does not carry.
 */
function getMissionStepContractRenderContent(content: unknown): MissionStepContractRenderView {
  const record = asRecord(content);
  return {
    action: asNonEmptyString(record?.['action']),
    mission: asNonEmptyString(record?.['mission']),
    steps: asRecordArray(record?.['steps']).map(toStepRenderView),
  };
}

/**
 * Mission Step Contract Details renderer (FR-011, FR-012). The only typed
 * content renderer in this mission that performs its own additional data
 * reads: it resolves each step's `delegates_to.candidates` against
 * **same-pack-only** (C-004 — no parent-chain traversal, unlike WP01's
 * origin-aware table-navigation resolver) Directive/Tactic artifacts.
 *
 * Steps render immediately from `content`; delegate candidates start
 * unresolved (plain text/badge) and "upgrade" in place to links once the two
 * batched `listByPackAndType` calls settle (research.md R7) — resolution
 * never blocks the initial render.
 */
@Component({
  selector: 'app-mission-step-contract-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HlmBadgeImports],
  host: {
    class: 'block',
  },
  template: `
    <div class="space-y-4">
      @if (view().action || view().mission) {
        <div class="space-y-1">
          @if (view().action) {
            <p class="text-sm">
              <span class="font-medium">Action:</span>
              <span class="font-mono">{{ view().action }}</span>
            </p>
          }
          @if (view().mission) {
            <p class="text-sm">
              <span class="font-medium">Mission:</span>
              <span class="font-mono">{{ view().mission }}</span>
            </p>
          }
        </div>
      }

      <ol class="space-y-3">
        @for (step of view().steps; track step.id) {
          <li class="border-border space-y-2 rounded-md border p-3">
            <span class="text-muted-foreground font-mono text-xs">{{ step.id }}</span>

            @if (step.description) {
              <p class="text-sm">{{ step.description }}</p>
            }
            @if (step.guidance) {
              <p class="text-muted-foreground text-sm">{{ step.guidance }}</p>
            }
            @if (step.command) {
              <code class="bg-muted block w-fit rounded px-1.5 py-0.5 font-mono text-sm">{{
                step.command
              }}</code>
            }

            @if (step.inputs.length > 0) {
              <ul class="space-y-1">
                @for (inputItem of step.inputs; track $index) {
                  <li class="flex flex-wrap items-center gap-1.5 text-sm">
                    @if (inputItem.flag) {
                      <span class="font-mono text-xs">{{ inputItem.flag }}</span>
                    }
                    @if (inputItem.source) {
                      <span class="text-muted-foreground text-xs">from {{ inputItem.source }}</span>
                    }
                    @if (inputItem.optional) {
                      <span hlmBadge variant="outline" class="text-[10px]">optional</span>
                    }
                  </li>
                }
              </ul>
            }

            @if (step.delegateCandidateIds.length > 0) {
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-muted-foreground text-xs">Delegates to:</span>
                @for (candidateId of step.delegateCandidateIds; track candidateId) {
                  @if (resolveLink(step.delegatesToKind, candidateId); as link) {
                    <a
                      class="focus-visible:ring-ring rounded-sm text-sm outline-none hover:underline focus-visible:ring-2"
                      [routerLink]="link"
                    >
                      {{ candidateId }}
                    </a>
                  } @else {
                    <span hlmBadge variant="outline">{{ candidateId }}</span>
                  }
                }
              </div>
            }
          </li>
        }
      </ol>
    </div>
  `,
})
export class MissionStepContractContent {
  private readonly artifactsRead = inject(ArtifactsReadService);

  readonly content = input<unknown>(null);
  readonly packId = input.required<string>();

  /** `artifact_id -> PocketBase record id`, own-pack directives (C-004). */
  private readonly directiveRecordIds = signal<Map<string, string>>(new Map());
  /** `artifact_id -> PocketBase record id`, own-pack tactics (C-004). */
  private readonly tacticRecordIds = signal<Map<string, string>>(new Map());

  protected readonly view = computed(() => getMissionStepContractRenderContent(this.content()));

  constructor() {
    effect(() => {
      const packId = this.packId();
      // Track `content()` too so a content-only change (same pack) re-resolves.
      this.content();
      this.directiveRecordIds.set(new Map());
      this.tacticRecordIds.set(new Map());
      void this.resolveDelegates(packId);
    });
  }

  /**
   * Combines the current resolution-map signals with a candidate's `kind`/id.
   * Returns `null` immediately (never an error/pending state) when the maps
   * haven't resolved yet, the kind isn't resolvable, or there's no match —
   * the same call naturally starts returning a real link once the maps
   * populate, since it's read from a `computed()`/template context.
   */
  protected resolveLink(kind: string | undefined, candidateId: string): string[] | null {
    if (!isResolvableDelegateKind(kind)) {
      return null;
    }
    const recordId =
      kind === 'directive'
        ? this.directiveRecordIds().get(candidateId)
        : this.tacticRecordIds().get(candidateId);
    if (!recordId) {
      return null;
    }
    // NOTE: WP01's `ARTIFACT_TYPE_ROUTE_SEGMENT` (detail/artifact-types.ts) was not yet
    // present in this lane's working tree at implementation time — literal segments used
    // here instead to avoid a hard cross-WP file dependency. Swap to the shared constant
    // once WP01 merges.
    const routeSegment = kind === 'directive' ? 'directives' : 'tactics';
    return ['/packs', this.packId(), routeSegment, recordId];
  }

  private async resolveDelegates(packId: string): Promise<void> {
    await Promise.all([
      this.resolveKind(packId, 'directive', this.directiveRecordIds),
      this.resolveKind(packId, 'tactic', this.tacticRecordIds),
    ]);
  }

  /** Fetches and maps one kind's own-pack artifacts; failures degrade to an empty map, independently of the other kind. */
  private async resolveKind(
    packId: string,
    kind: ResolvableDelegateKind,
    target: ReturnType<typeof signal<Map<string, string>>>,
  ): Promise<void> {
    try {
      const result = await this.artifactsRead.listByPackAndType(packId, kind);
      target.set(new Map(result.items.map((item) => [item.artifact_id, item.id])));
    } catch {
      target.set(new Map());
    }
  }
}
