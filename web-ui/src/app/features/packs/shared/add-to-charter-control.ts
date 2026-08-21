import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { LoadingIndicator } from '../../../shared';
import type { ArtifactKind, CharterItem, RelatedItemCandidate } from '../../charters/models';
import { ActiveCharterStore, CharterAddRelatedDialog } from '../../charters/shared';
import { CharterMembershipService } from '../data-access';

const NO_ACTIVE_CHARTER_MESSAGE =
  'Create or activate a charter before adding artifacts to it.';

/**
 * Reusable Add-to-Charter / Remove-from-Charter button (FR-007, FR-008, FR-009, FR-010,
 * FR-024, FR-026) used on every pack-artifact surface. Goes through `CharterMembershipService`/
 * `ChartersApiService` — never calls PocketBase/the charter API directly.
 *
 * Dual lookup mode:
 * - Single-lookup mode (default, `membershipOverride` left `undefined`): resolves its own
 *   membership via `CharterMembershipService.isInActiveCharter`. Intended for detail pages
 *   showing exactly one artifact (no batching benefit).
 * - Batch/override mode (`membershipOverride` set to a `CharterItem | null`): trusts the
 *   parent-supplied value entirely and never performs its own lookup. Intended for table
 *   contexts where the parent already batch-loaded membership via `listMembershipForPack`
 *   to avoid N+1 lookups across many rows.
 *
 * FR-026: adding a directive that other artifacts reference back to shows the same
 * `CharterAddRelatedDialog` confirmation used on the Charter Detail page's grid, so the
 * behaviour is identical regardless of which pack-artifact surface the maintainer starts from.
 */
@Component({
  selector: 'app-add-to-charter-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, HlmTooltipImports, LoadingIndicator, CharterAddRelatedDialog],
  host: {
    class: 'inline-flex',
  },
  template: `
    @if (loading()) {
      <app-loading-indicator [label]="loadingLabel()" [showLabel]="false" />
    } @else {
      <button
        type="button"
        hlmBtn
        variant="outline"
        size="sm"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel()"
        [hlmTooltip]="noActiveCharterMessage"
        [tooltipDisabled]="hasActiveCharter()"
        (click)="onClick()"
      >
        {{ buttonLabel() }}
      </button>
    }

    <app-charter-add-related-dialog
      [(open)]="relatedDialogOpen"
      [targetName]="artifactName()"
      [relatedItems]="relatedItems()"
      [loading]="relatedDialogLoading()"
      (confirmed)="onRelatedConfirmed($event)"
      (cancelled)="onRelatedCancelled()"
    />
  `,
})
export class AddToCharterControl {
  private readonly membership = inject(CharterMembershipService);
  private readonly activeCharterStore = inject(ActiveCharterStore);

  readonly artifactType = input.required<ArtifactKind>();
  readonly artifactId = input.required<string>();
  /** The `pack_artifacts` record id needed for `CharterMembershipService.add`. */
  readonly packArtifactId = input.required<string>();
  /** Display name shown in the FR-026 related-items dialog title/description. */
  readonly artifactName = input.required<string>();
  /**
   * When provided (not `undefined`), skips the internal membership lookup and uses this
   * value instead — batch/table mode. Leave `undefined` for single-lookup mode.
   */
  readonly membershipOverride = input<CharterItem | null | undefined>(undefined);

  /** Emitted after a successful add/remove so a batch-mode parent can refresh its cached map. */
  readonly membershipChanged = output<void>();

  /**
   * Emits the current membership boolean whenever it (re)resolves, in either mode — lets a
   * parent drive a separate `<app-in-charter-badge>` sitting alongside this control without
   * duplicating the membership lookup itself.
   */
  readonly membershipResolved = output<boolean>();

  protected readonly noActiveCharterMessage = NO_ACTIVE_CHARTER_MESSAGE;
  protected readonly loading = signal(false);

  /** Only populated/consumed in single-lookup mode; ignored while `membershipOverride` is set. */
  private readonly resolvedMembership = signal<CharterItem | null>(null);

  /** FR-026: state for the related-items confirmation dialog, mirroring `CharterDetailPage`. */
  protected readonly relatedDialogOpen = signal(false);
  protected readonly relatedDialogLoading = signal(false);
  protected readonly relatedItems = signal<RelatedItemCandidate[]>([]);

  protected readonly hasActiveCharter = computed(() => this.activeCharterStore.hasActiveCharter());

  private readonly effectiveMembership = computed<CharterItem | null>(() => {
    const override = this.membershipOverride();
    return override !== undefined ? override : this.resolvedMembership();
  });

  protected readonly isMember = computed(() => this.effectiveMembership() !== null);

  protected readonly disabled = computed(() => !this.hasActiveCharter() || this.loading());

  protected readonly buttonLabel = computed(() =>
    this.isMember() ? 'Remove from Charter' : 'Add to Charter',
  );

  protected readonly loadingLabel = computed(() =>
    this.isMember() ? 'Removing from charter' : 'Adding to charter',
  );

  /**
   * Non-color-only, always-present explanation of the disabled state (NFR-003) — the
   * `hlmTooltip` above covers hover/focus; this covers screen readers directly.
   */
  protected readonly ariaLabel = computed(() =>
    this.hasActiveCharter()
      ? this.buttonLabel()
      : `${this.buttonLabel()}. ${NO_ACTIVE_CHARTER_MESSAGE}`,
  );

  constructor() {
    effect(() => {
      // `membershipOverride` mode must never trigger its own network lookup (N+1 guard).
      if (this.membershipOverride() !== undefined) {
        return;
      }
      const artifactType = this.artifactType();
      const artifactId = this.artifactId();
      void this.loadMembership(artifactType, artifactId);
    });

    effect(() => {
      this.membershipResolved.emit(this.isMember());
    });
  }

  private async loadMembership(artifactType: ArtifactKind, artifactId: string): Promise<void> {
    try {
      const result = await this.membership.isInActiveCharter(artifactType, artifactId);
      this.resolvedMembership.set(result);
    } catch {
      this.resolvedMembership.set(null);
    }
  }

  protected async onClick(): Promise<void> {
    if (this.disabled()) {
      return;
    }

    const current = this.effectiveMembership();
    if (!current && this.artifactType() === 'directive') {
      await this.startAdd();
      return;
    }

    const wasOverride = this.membershipOverride() !== undefined;
    this.loading.set(true);
    try {
      if (current) {
        await this.membership.remove(current.charter, current.id);
        if (!wasOverride) {
          this.resolvedMembership.set(null);
        }
      } else {
        const created = await this.membership.add(this.packArtifactId());
        if (!wasOverride) {
          this.resolvedMembership.set(created);
        }
      }
      this.membershipChanged.emit();
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * FR-026: before adding a directive, check whether other artifacts reference it back. If so,
   * open the confirmation dialog instead of adding immediately; otherwise add straight away,
   * exactly like the non-directive path.
   */
  private async startAdd(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.membership.getRelatedItems(this.packArtifactId());
      if (result && result.related.length > 0) {
        this.relatedItems.set(result.related);
        this.relatedDialogOpen.set(true);
        return;
      }
    } catch {
      toast.error('Failed to check for related items');
      return;
    } finally {
      this.loading.set(false);
    }

    await this.addDirect();
  }

  private async addDirect(): Promise<void> {
    const wasOverride = this.membershipOverride() !== undefined;
    this.loading.set(true);
    try {
      const created = await this.membership.add(this.packArtifactId());
      if (!wasOverride) {
        this.resolvedMembership.set(created);
      }
      this.membershipChanged.emit();
    } finally {
      this.loading.set(false);
    }
  }

  /** FR-026: confirming the dialog adds the directive plus every item the maintainer left checked, in one call. */
  protected async onRelatedConfirmed(selectedRelatedIds: string[]): Promise<void> {
    const wasOverride = this.membershipOverride() !== undefined;
    this.relatedDialogLoading.set(true);
    try {
      const result = await this.membership.addBulk([this.packArtifactId(), ...selectedRelatedIds]);
      this.relatedDialogOpen.set(false);
      if (!wasOverride) {
        const created = result.items.find((item) => item.artifact_id === this.artifactId()) ?? null;
        this.resolvedMembership.set(created);
      }
      this.membershipChanged.emit();
      toast.success(
        result.items.length === 1
          ? `${this.artifactName()} added to charter`
          : `${this.artifactName()} and ${result.items.length - 1} related item${result.items.length - 1 === 1 ? '' : 's'} added to charter`,
      );
    } catch {
      toast.error('Failed to add items');
    } finally {
      this.relatedDialogLoading.set(false);
      this.relatedItems.set([]);
    }
  }

  /** Cancelling the related-items dialog adds nothing at all, including the directive itself. */
  protected onRelatedCancelled(): void {
    this.relatedDialogOpen.set(false);
    this.relatedItems.set([]);
  }
}
