import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { Subject, debounceTime } from 'rxjs';

import { LoadingIndicator, type ConfirmDialogResult } from '../../../shared';
import { PacksApiError, PacksApiService, PacksReadService } from '../data-access';
import type { Pack, PackListFilters, ParentStatusMap } from '../models';
import {
  PackFilters,
  emptyPackFilterForm,
  toPackListFilters,
  type PackFilterFormState,
} from './pack-filters';
import { PackImportDialog } from './pack-import-dialog';
import { PackRemoveDialog } from './pack-remove-dialog';
import { PackTable } from './pack-table';

@Component({
  selector: 'app-pack-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmEmptyImports,
    LoadingIndicator,
    PackFilters,
    PackTable,
    PackImportDialog,
    PackRemoveDialog,
  ],
  host: {
    class: 'block',
  },
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-foreground text-2xl font-semibold tracking-tight">Packs</h1>
          <p class="text-muted-foreground mt-1 text-sm">
            Browse indexed doctrine packs. Import from a local path, export, or remove.
          </p>
        </div>
        <button type="button" hlmBtn (click)="openImport()">Import pack</button>
      </div>

      <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div class="w-full shrink-0 lg:w-[28%] lg:max-w-xs">
          <app-pack-filters [(form)]="filterForm" (filtersChange)="onFiltersChange($event)" />
        </div>

        <section class="min-w-0 flex-1 space-y-3" aria-label="Pack list">
          @if (refreshLoadingId() || exportLoadingId() || removeLoadingId()) {
            <div class="flex flex-wrap items-center gap-4" aria-live="polite">
              @if (refreshLoadingId()) {
                <app-loading-indicator label="Refresh in progress" [showLabel]="true" />
              }
              @if (exportLoadingId()) {
                <app-loading-indicator label="Export in progress" [showLabel]="true" />
              }
              @if (removeLoadingId()) {
                <app-loading-indicator label="Remove in progress" [showLabel]="true" />
              }
            </div>
          }

          @if (listLoading()) {
            <app-loading-indicator mode="skeleton" label="Loading packs" [skeletonCount]="5" />
          } @else if (listError()) {
            <div hlmAlert variant="destructive">
              <h3 hlmAlertTitle>Could not load packs</h3>
              <p hlmAlertDescription>{{ listError() }}</p>
              <button
                type="button"
                hlmAlertAction
                hlmBtn
                variant="outline"
                size="sm"
                (click)="reload()"
              >
                Retry
              </button>
            </div>
          } @else if (visiblePacks().length === 0) {
            <div hlmEmpty class="border-border min-h-64 border">
              <div hlmEmptyHeader>
                @if (hasActiveFilters()) {
                  <div hlmEmptyTitle>No packs match your filters</div>
                  <div hlmEmptyDescription>
                    Try adjusting or clearing the filters to see more results.
                  </div>
                } @else {
                  <div hlmEmptyTitle>No packs found</div>
                  <div hlmEmptyDescription>
                    Import a local doctrine pack, or adjust filters to see indexed packs.
                  </div>
                }
              </div>
              <div hlmEmptyContent>
                @if (hasActiveFilters()) {
                  <button type="button" hlmBtn variant="outline" (click)="resetFilters()">
                    Reset filters
                  </button>
                } @else {
                  <button type="button" hlmBtn (click)="openImport()">Import pack</button>
                }
              </div>
            </div>
          } @else {
            <app-pack-table
              [packs]="visiblePacks()"
              [refreshingPackId]="refreshLoadingId()"
              [exportingPackId]="exportLoadingId()"
              [removingPackId]="removeLoadingId()"
              [parentStatus]="parentStatus()"
              (refreshPack)="onRefresh($event)"
              (exportPack)="onExport($event)"
              (removePack)="onRemoveRequest($event)"
            />
          }
        </section>
      </div>
    </div>

    <app-pack-import-dialog
      [(open)]="importOpen"
      [loading]="importLoading()"
      [error]="importError()"
      (importRequested)="onImport($event)"
    />

    <app-pack-remove-dialog
      [(open)]="removeOpen"
      [pack]="removeTarget()"
      [(deleteFiles)]="removeDeleteFiles"
      (confirmed)="onRemoveConfirmed($event)"
    />
  `,
})
export class PackOverviewPage {
  private readonly packsRead = inject(PacksReadService);
  private readonly packsApi = inject(PacksApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly filterSubject = new Subject<PackListFilters>();
  private activeFilters: PackListFilters = {};

  protected readonly filterForm = signal<PackFilterFormState>(emptyPackFilterForm());

  protected readonly packs = signal<Pack[]>([]);
  protected readonly listLoading = signal(true);
  protected readonly listError = signal<string | null>(null);

  /** Parent chain status per pack id (FR-003/FR-009/FR-010) — soft-fails independently of the list. */
  protected readonly parentStatus = signal<ParentStatusMap>({});

  /** Client-side narrowing to only missing/broken-ancestor packs (FR-014) — never re-fetches. */
  protected readonly visiblePacks = computed(() => {
    const all = this.packs();
    if (!this.filterForm().missingParentOnly) {
      return all;
    }
    const status = this.parentStatus();
    return all.filter((pack) => {
      const chainStatus = status[pack.id]?.status;
      return chainStatus === 'missing' || chainStatus === 'broken-ancestor';
    });
  });

  /** True when any sidebar filter (name/origin/dates/missing-parent) differs from its default. */
  protected readonly hasActiveFilters = computed(() => {
    const form = this.filterForm();
    const empty = emptyPackFilterForm();
    return (
      form.name.trim() !== empty.name ||
      form.origin !== empty.origin ||
      form.importedAtFrom !== empty.importedAtFrom ||
      form.importedAtTo !== empty.importedAtTo ||
      form.updatedAtFrom !== empty.updatedAtFrom ||
      form.updatedAtTo !== empty.updatedAtTo ||
      form.missingParentOnly !== empty.missingParentOnly
    );
  });

  protected readonly importOpen = signal(false);
  protected readonly importLoading = signal(false);
  protected readonly importError = signal<string | null>(null);

  protected readonly removeOpen = signal(false);
  protected readonly removeTarget = signal<Pack | null>(null);
  protected readonly removeDeleteFiles = signal(false);

  /** Pack ids with an in-flight refresh / export / remove call — drive FR-024 loading UI. */
  protected readonly refreshLoadingId = signal<string | null>(null);
  protected readonly exportLoadingId = signal<string | null>(null);
  protected readonly removeLoadingId = signal<string | null>(null);

  constructor() {
    this.filterSubject
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe((filters) => {
        this.activeFilters = filters;
        void this.loadPacks();
      });

    void this.loadPacks();
  }

  protected onFiltersChange(filters: PackListFilters): void {
    this.filterSubject.next(filters);
  }

  protected openImport(): void {
    this.importError.set(null);
    this.importOpen.set(true);
  }

  protected reload(): void {
    void this.loadPacks();
  }

  /** Clears every sidebar filter (server-side and client-side) and re-queries the full list. */
  protected resetFilters(): void {
    this.filterForm.set(emptyPackFilterForm());
    this.activeFilters = {};
    void this.loadPacks();
  }

  protected async onImport(sourcePath: string): Promise<void> {
    this.importLoading.set(true);
    this.importError.set(null);
    try {
      await this.packsApi.importPack(sourcePath);
      this.importOpen.set(false);
      toast.success('The pack was imported successfully.');
      await this.loadPacks();
    } catch (error) {
      // Do not add ghost rows — only surface the error in the dialog.
      this.importError.set(errorMessage(error, 'Import failed'));
    } finally {
      this.importLoading.set(false);
    }
  }

  protected async onRefresh(pack: Pack): Promise<void> {
    this.refreshLoadingId.set(pack.id);
    try {
      await this.packsApi.refreshPack(pack.id);
      toast.success(`“${pack.name}” was refreshed from its source.`);
      await this.loadPacks();
    } catch (error) {
      toast.error(errorMessage(error, 'Refresh failed'));
    } finally {
      this.refreshLoadingId.set(null);
    }
  }

  protected async onExport(pack: Pack): Promise<void> {
    this.exportLoadingId.set(pack.id);
    try {
      const result = await this.packsApi.exportPack(pack.id);
      downloadBlob(result.blob, result.filename ?? `${pack.name}-${pack.version || 'pack'}.zip`);

      if (result.validationStatus === 'errors') {
        toast.error(formatValidationErrors(result.validationErrors));
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Export failed'));
    } finally {
      this.exportLoadingId.set(null);
    }
  }

  protected onRemoveRequest(pack: Pack): void {
    this.removeTarget.set(pack);
    this.removeDeleteFiles.set(false);
    this.removeOpen.set(true);
  }

  protected async onRemoveConfirmed(result: ConfirmDialogResult): Promise<void> {
    const pack = this.removeTarget();
    if (!pack || !result.confirmed) {
      return;
    }

    const deleteFiles = pack.origin === 'local' ? result.toggleValue : false;
    this.removeLoadingId.set(pack.id);
    try {
      await this.packsApi.removePack(pack.id, deleteFiles);
      this.removeTarget.set(null);
      toast.success(`“${pack.name}” was removed from the index.`);
      await this.loadPacks();
    } catch (error) {
      toast.error(errorMessage(error, 'Remove failed'));
    } finally {
      this.removeLoadingId.set(null);
    }
  }

  private async loadPacks(): Promise<void> {
    this.listLoading.set(true);
    this.listError.set(null);
    try {
      const filters =
        Object.keys(this.activeFilters).length > 0
          ? this.activeFilters
          : toPackListFilters(this.filterForm());
      const [result, statusMap] = await Promise.all([
        this.packsRead.list(filters),
        // Soft-fail: the warning indicator is a secondary enhancement, not page-blocking.
        this.packsApi.getParentStatus().catch(() => null),
      ]);
      this.packs.set(result.items);
      if (statusMap) {
        this.parentStatus.set(statusMap);
      }
    } catch (error) {
      this.packs.set([]);
      this.listError.set(errorMessage(error, 'Failed to load packs'));
    } finally {
      this.listLoading.set(false);
    }
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof PacksApiError) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function formatValidationErrors(errors: unknown): string {
  if (errors == null) {
    return 'The ZIP downloaded, but pack validation reported errors.';
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
    return parts.join('; ') || 'The ZIP downloaded, but pack validation reported errors.';
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
