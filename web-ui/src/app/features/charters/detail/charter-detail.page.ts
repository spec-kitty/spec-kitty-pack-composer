import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';

import {
  AppBreadcrumb,
  type BreadcrumbItem,
  ConfirmDialog,
  type ConfirmDialogResult,
  LoadingIndicator,
} from '../../../shared';
import { CharterApiError, ChartersApiService, ChartersReadService } from '../data-access';
import type {
  Charter,
  CharterGrid as CharterGridModel,
  CharterGridCard as CharterGridCardModel,
  RelatedItemCandidate,
} from '../models';
import { CharterDeleteDialog } from '../overview/charter-delete-dialog';
import { CharterRenameDialog } from '../overview/charter-rename-dialog';
import { CharterAddRelatedDialog } from '../shared/charter-add-related-dialog';
import { CharterGrid, type CharterGridToggleEvent } from './charter-grid';

const ARTIFACT_KINDS = [
  'directive',
  'tactic',
  'procedure',
  'styleguide',
  'toolguide',
  'profile',
  'mission_step_contract',
  'template',
  'glossary',
] as const;

/**
 * Charter Detail page — header (name/active badge/actions), breadcrumb, and the
 * enabled/disabled artifact grid (FR-013–FR-016, FR-022, FR-024). `/charters/:id`
 * is declared by this WP (see `charters.routes.ts`); this page is the target component.
 */
@Component({
  selector: 'app-charter-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AppBreadcrumb,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmEmptyImports,
    LoadingIndicator,
    CharterGrid,
    CharterRenameDialog,
    CharterDeleteDialog,
    CharterAddRelatedDialog,
    ConfirmDialog,
  ],
  host: {
    class: 'block',
  },
  template: `
    @if (loading() && !charter()) {
      <div class="flex justify-center py-16">
        <app-loading-indicator label="Loading charter" />
      </div>
    } @else if (!charter() && error(); as err) {
      <div class="space-y-4 py-8">
        <div hlmAlert variant="destructive">
          <h3 hlmAlertTitle>Could not load charter</h3>
          <p hlmAlertDescription>{{ err }}</p>
          <button type="button" hlmAlertAction hlmBtn variant="outline" size="sm" (click)="onRetry()">
            Retry
          </button>
        </div>
        <div class="flex justify-center">
          <a hlmBtn variant="outline" routerLink="/charters">Back to charters</a>
        </div>
      </div>
    } @else if (charter(); as current) {
      @if (error(); as err) {
        <p class="text-destructive mb-4 text-sm" role="alert">{{ err }}</p>
      }

      <app-breadcrumb [items]="breadcrumbItems()" class="mb-4 block" />

      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <h1 class="text-foreground text-2xl font-semibold tracking-tight">{{ current.name }}</h1>
          @if (current.active) {
            <span hlmBadge variant="default">Active</span>
          } @else {
            <span hlmBadge variant="secondary">Inactive</span>
          }
        </div>
        <div class="flex items-center gap-2">
          <button type="button" hlmBtn variant="outline" (click)="onRenameRequest()">Rename</button>
          <button type="button" hlmBtn variant="outline" (click)="onExportClick()">Export</button>
          <button type="button" hlmBtn variant="destructive" (click)="onDeleteRequest()">Delete</button>
        </div>
      </div>

      <div class="mt-6">
        @if (actionLoading()) {
          <div class="mb-3" aria-live="polite">
            <app-loading-indicator label="Updating charter" [showLabel]="true" />
          </div>
        }

        @if (gridLoading()) {
          <app-loading-indicator mode="skeleton" label="Loading grid" [skeletonCount]="6" />
        } @else if (gridError()) {
          <div hlmAlert variant="destructive">
            <h3 hlmAlertTitle>Could not load the artifact grid</h3>
            <p hlmAlertDescription>{{ gridError() }}</p>
            <button type="button" hlmAlertAction hlmBtn variant="outline" size="sm" (click)="onGridRetry()">
              Retry
            </button>
          </div>
        } @else if (totalCardCount() === 0) {
          <div hlmEmpty class="border-border min-h-64 border">
            <div hlmEmptyHeader>
              <div hlmEmptyTitle>No artifacts available</div>
              <div hlmEmptyDescription>
                Import a pack from the Packs feature to make its artifacts available here.
              </div>
            </div>
            <div hlmEmptyContent>
              <a hlmBtn routerLink="/packs">Go to Packs</a>
            </div>
          </div>
        } @else if (grid(); as gridData) {
          <app-charter-grid
            [grid]="gridData"
            [busyAddId]="pendingAddId()"
            [busyRemoveId]="pendingRemoveId()"
            (toggle)="onToggle($event)"
            (add)="onAdd($event)"
            (resolveConflict)="onResolveConflict($event)"
            (remove)="onRemoveRequest($event)"
          />
        }
      </div>
    }

    <app-charter-rename-dialog
      [(open)]="renameOpen"
      [charter]="charter()"
      [loading]="renameLoading()"
      [error]="renameError()"
      (renamed)="onRenameConfirmed($event)"
    />

    <app-charter-delete-dialog
      [(open)]="deleteOpen"
      [charter]="charter()"
      (confirmed)="onDeleteConfirmed($event)"
    />

    <app-charter-add-related-dialog
      [(open)]="relatedDialogOpen"
      [targetName]="relatedTargetCard()?.artifact_name ?? ''"
      [relatedItems]="relatedItems()"
      [loading]="relatedDialogLoading()"
      (confirmed)="onRelatedConfirmed($event)"
      (cancelled)="onRelatedCancelled()"
    />

    <app-confirm-dialog
      [(open)]="removeConfirmOpen"
      title="Remove from charter"
      [description]="removeConfirmDescription()"
      confirmLabel="Remove"
      cancelLabel="Cancel"
      confirmVariant="destructive"
      (confirmed)="onRemoveConfirmed($event)"
      (cancelled)="onRemoveCancelled()"
    />
  `,
})
export class CharterDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chartersRead = inject(ChartersReadService);
  private readonly chartersApi = inject(ChartersApiService);

  private readonly charterId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  protected readonly charter = signal<Charter | null>(null);
  protected readonly grid = signal<CharterGridModel | null>(null);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly gridLoading = signal(false);
  protected readonly gridError = signal<string | null>(null);

  /** Scoped, grid-area loading indicator for card actions (FR-024) — not a full-page block. */
  protected readonly actionLoading = signal(false);

  /**
   * `pack_artifact_id` of the card currently being added, if any. Drives the
   * per-card button spinner instead of the `actionLoading` banner above the
   * grid, so adding an item never shifts the page layout (FR-024).
   */
  protected readonly pendingAddId = signal<string | null>(null);

  protected readonly renameOpen = signal(false);
  protected readonly renameLoading = signal(false);
  protected readonly renameError = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);

  /**
   * FR-026: adding a directive that other artifacts reference back to opens
   * this confirmation dialog instead of adding immediately. `relatedTargetCard`
   * is the directive card the flow started from; `relatedItems` are the
   * referencing artifacts fetched for it.
   */
  protected readonly relatedDialogOpen = signal(false);
  protected readonly relatedDialogLoading = signal(false);
  protected readonly relatedTargetCard = signal<CharterGridCardModel | null>(null);
  protected readonly relatedItems = signal<RelatedItemCandidate[]>([]);

  /** `charter_item_id` of the card currently being removed, if any (per-card spinner, FR-024). */
  protected readonly pendingRemoveId = signal<string | null>(null);
  protected readonly removeConfirmOpen = signal(false);
  protected readonly removeTargetCard = signal<CharterGridCardModel | null>(null);
  protected readonly removeConfirmDescription = computed(() => {
    const card = this.removeTargetCard();
    return card
      ? `Remove “${card.artifact_name}” from this charter? You can add it back later.`
      : 'Remove this item from the charter?';
  });

  protected readonly totalCardCount = computed(() => {
    const gridData = this.grid();
    if (!gridData) {
      return 0;
    }
    return ARTIFACT_KINDS.reduce((sum, kind) => sum + (gridData[kind]?.length ?? 0), 0);
  });

  protected readonly breadcrumbItems = computed((): BreadcrumbItem[] => {
    const current = this.charter();
    return [
      { label: 'Charters', routerLink: ['/charters'] },
      ...(current ? [{ label: current.name }] : []),
    ];
  });

  constructor() {
    effect(() => {
      const id = this.charterId();
      if (id) {
        void this.loadDetail(id);
      } else {
        this.error.set('Missing charter id in route.');
        this.charter.set(null);
      }
    });
  }

  protected onRetry(): void {
    const id = this.charterId();
    if (id) {
      void this.loadDetail(id);
    }
  }

  protected onGridRetry(): void {
    const id = this.charterId();
    if (id) {
      void this.loadGrid(id);
    }
  }

  protected onRenameRequest(): void {
    this.renameError.set(null);
    this.renameOpen.set(true);
  }

  protected async onRenameConfirmed(name: string): Promise<void> {
    const id = this.charterId();
    if (!id) {
      return;
    }
    this.renameLoading.set(true);
    this.renameError.set(null);
    try {
      const updated = await this.chartersApi.renameCharter(id, name);
      this.charter.update((current) => (current ? { ...current, name: updated.name } : current));
      this.renameOpen.set(false);
    } catch (error) {
      this.renameError.set(errorMessage(error, 'Rename failed'));
    } finally {
      this.renameLoading.set(false);
    }
  }

  protected onDeleteRequest(): void {
    this.deleteOpen.set(true);
  }

  protected async onDeleteConfirmed(result: ConfirmDialogResult): Promise<void> {
    const id = this.charterId();
    if (!id || !result.confirmed) {
      return;
    }
    try {
      await this.chartersApi.deleteCharter(id);
      void this.router.navigate(['/charters']);
    } catch (error) {
      this.error.set(errorMessage(error, 'Delete failed'));
    }
  }

  protected async onExportClick(): Promise<void> {
    const id = this.charterId();
    if (!id) {
      return;
    }
    const current = this.charter();
    this.error.set(null);
    try {
      const result = await this.chartersApi.exportCharter(id);
      downloadBlob(result.blob, result.filename ?? `${current?.name ?? 'charter'}-charter.zip`);

      if (result.validationStatus === 'errors') {
        this.error.set(formatValidationErrors(result.validationErrors));
      }
    } catch (error) {
      this.error.set(errorMessage(error, 'Export failed'));
    }
  }

  protected async onToggle(event: CharterGridToggleEvent): Promise<void> {
    const id = this.charterId();
    const itemId = event.card.charter_item_id;
    if (!id || !itemId) {
      return;
    }
    this.actionLoading.set(true);
    this.error.set(null);
    try {
      await this.chartersApi.toggleItem(id, itemId, event.enabled);
      await this.loadGrid(id, { silent: true });
    } catch (error) {
      this.error.set(errorMessage(error, 'Failed to update item'));
    } finally {
      this.actionLoading.set(false);
    }
  }

  protected async onAdd(card: CharterGridCardModel): Promise<void> {
    const id = this.charterId();
    if (!id) {
      return;
    }
    const packArtifactId = card.pack_artifact_id;
    if (!packArtifactId) {
      // Should not normally happen for a genuine not-in-charter card — those always
      // come from live pack_artifacts records. Missing-source cards omit this field
      // and are not addable.
      toast.error('Cannot add this artifact: its source pack artifact is missing.');
      return;
    }

    if (card.artifact_type === 'directive') {
      this.pendingAddId.set(packArtifactId);
      try {
        const result = await this.chartersApi.getRelatedItems(id, packArtifactId);
        if (result.related.length > 0) {
          this.relatedTargetCard.set(card);
          this.relatedItems.set(result.related);
          this.relatedDialogOpen.set(true);
          return;
        }
      } catch (error) {
        toast.error(errorMessage(error, 'Failed to check for related items'));
        return;
      } finally {
        this.pendingAddId.set(null);
      }
    }

    this.pendingAddId.set(packArtifactId);
    try {
      await this.chartersApi.addItem(id, packArtifactId);
      await this.loadGrid(id, { silent: true });
      toast.success(`${card.artifact_name} added to charter`);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to add item'));
    } finally {
      this.pendingAddId.set(null);
    }
  }

  /** FR-026: confirming the related-items dialog adds the directive plus every item the maintainer left checked, in one call. */
  protected async onRelatedConfirmed(selectedRelatedIds: string[]): Promise<void> {
    const id = this.charterId();
    const target = this.relatedTargetCard();
    const targetPackArtifactId = target?.pack_artifact_id;
    if (!id || !target || !targetPackArtifactId) {
      return;
    }
    this.relatedDialogLoading.set(true);
    try {
      const result = await this.chartersApi.addItemsBulk(id, [targetPackArtifactId, ...selectedRelatedIds]);
      this.relatedDialogOpen.set(false);
      await this.loadGrid(id, { silent: true });
      toast.success(
        result.items.length === 1
          ? `${target.artifact_name} added to charter`
          : `${target.artifact_name} and ${result.items.length - 1} related item${result.items.length - 1 === 1 ? '' : 's'} added to charter`,
      );
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to add items'));
    } finally {
      this.relatedDialogLoading.set(false);
      this.relatedTargetCard.set(null);
      this.relatedItems.set([]);
    }
  }

  /** Cancelling the related-items dialog adds nothing at all, including the directive itself. */
  protected onRelatedCancelled(): void {
    this.relatedDialogOpen.set(false);
    this.relatedTargetCard.set(null);
    this.relatedItems.set([]);
  }

  protected onRemoveRequest(card: CharterGridCardModel): void {
    this.removeTargetCard.set(card);
    this.removeConfirmOpen.set(true);
  }

  protected async onRemoveConfirmed(result: ConfirmDialogResult): Promise<void> {
    const id = this.charterId();
    const card = this.removeTargetCard();
    const itemId = card?.charter_item_id;
    if (!id || !card || !itemId || !result.confirmed) {
      this.removeTargetCard.set(null);
      return;
    }
    this.pendingRemoveId.set(itemId);
    try {
      await this.chartersApi.removeItem(id, itemId);
      await this.loadGrid(id, { silent: true });
      toast.success(`${card.artifact_name} removed from charter`);
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to remove item'));
    } finally {
      this.pendingRemoveId.set(null);
      this.removeTargetCard.set(null);
    }
  }

  protected onRemoveCancelled(): void {
    this.removeTargetCard.set(null);
  }

  protected async onResolveConflict(card: CharterGridCardModel): Promise<void> {
    const id = this.charterId();
    const itemId = card.charter_item_id;
    if (!id || !itemId) {
      return;
    }
    this.actionLoading.set(true);
    this.error.set(null);
    try {
      await this.chartersApi.toggleItem(id, itemId, true);
      await this.loadGrid(id, { silent: true });
    } catch (error) {
      this.error.set(errorMessage(error, 'Failed to resolve conflict'));
    } finally {
      this.actionLoading.set(false);
    }
  }

  private async loadDetail(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const charter = await this.chartersRead.get(id);
      this.charter.set(charter);
      await this.loadGrid(id);
    } catch (error) {
      this.charter.set(null);
      this.error.set(errorMessage(error, 'Failed to load charter'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * `silent: true` is used for refetches after a mutation (add/toggle/resolve):
   * the grid stays mounted and its `@for` track-by keys let Angular patch just
   * the changed cards in place, instead of tearing the whole grid down for the
   * skeleton loader — the `actionLoading` indicator above it already covers the
   * in-flight state for that case (FR-024).
   */
  private async loadGrid(id: string, options?: { silent?: boolean }): Promise<void> {
    const silent = options?.silent ?? false;
    if (!silent) {
      this.gridLoading.set(true);
      this.gridError.set(null);
    }
    try {
      const grid = await this.chartersApi.getGrid(id);
      this.grid.set(grid);
    } catch (error) {
      // On a silent refetch failure, keep the last-good grid mounted (no error
      // takeover of the grid area) and rely on the caller's own `error` signal,
      // which is already surfaced above the grid, to report the failure.
      if (!silent) {
        this.grid.set(null);
        this.gridError.set(errorMessage(error, 'Failed to load grid'));
      }
    } finally {
      if (!silent) {
        this.gridLoading.set(false);
      }
    }
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof CharterApiError) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function formatValidationErrors(errors: unknown): string {
  if (errors == null) {
    return 'The ZIP downloaded, but charter validation reported errors.';
  }
  if (typeof errors === 'string') {
    return errors;
  }
  if (Array.isArray(errors)) {
    const parts = errors.map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (item && typeof item === 'object' && 'message' in item) {
        const message = (item as { message?: unknown }).message;
        return typeof message === 'string' ? message : JSON.stringify(item);
      }
      return JSON.stringify(item);
    });
    return parts.join('; ') || 'The ZIP downloaded, but charter validation reported errors.';
  }
  return JSON.stringify(errors);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
