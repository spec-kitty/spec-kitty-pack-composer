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
import { CharterApiError, ChartersApiService } from '../data-access';
import type { CharterSummary } from '../models';
import { ActiveCharterStore } from '../shared';
import { CharterCreateDialog } from './charter-create-dialog';
import { CharterDeleteDialog } from './charter-delete-dialog';
import {
  CharterFilters,
  emptyCharterFilterForm,
  type CharterFilterFormState,
  type CharterListFilters,
} from './charter-filters';
import { CharterImportDialog } from './charter-import-dialog';
import { CharterRenameDialog } from './charter-rename-dialog';
import { CharterTable } from './charter-table';

@Component({
  selector: 'app-charter-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmEmptyImports,
    LoadingIndicator,
    CharterFilters,
    CharterTable,
    CharterCreateDialog,
    CharterRenameDialog,
    CharterDeleteDialog,
    CharterImportDialog,
  ],
  host: {
    class: 'block',
  },
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-foreground text-2xl font-semibold tracking-tight">Charters</h1>
          <p class="text-muted-foreground mt-1 text-sm">
            Browse charters, activate the one you're working with, and manage its lifecycle.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" hlmBtn variant="outline" (click)="openImport()">Import charter</button>
          <button type="button" hlmBtn (click)="openCreate()">Create charter</button>
        </div>
      </div>

      <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div class="w-full shrink-0 lg:w-[28%] lg:max-w-xs">
          <app-charter-filters [(form)]="filterForm" (filtersChange)="onFiltersChange($event)" />
        </div>

        <section class="min-w-0 flex-1 space-y-3" aria-label="Charter list">
          @if (activatingCharterId() || renamingCharterId() || removingCharterId() || exportingCharterId()) {
            <div class="flex flex-wrap items-center gap-4" aria-live="polite">
              @if (activatingCharterId()) {
                <app-loading-indicator label="Activate in progress" [showLabel]="true" />
              }
              @if (renamingCharterId()) {
                <app-loading-indicator label="Rename in progress" [showLabel]="true" />
              }
              @if (removingCharterId()) {
                <app-loading-indicator label="Delete in progress" [showLabel]="true" />
              }
              @if (exportingCharterId()) {
                <app-loading-indicator label="Export in progress" [showLabel]="true" />
              }
            </div>
          }

          @if (listLoading()) {
            <app-loading-indicator mode="skeleton" label="Loading charters" [skeletonCount]="5" />
          } @else if (listError()) {
            <div hlmAlert variant="destructive">
              <h3 hlmAlertTitle>Could not load charters</h3>
              <p hlmAlertDescription>{{ listError() }}</p>
              <button type="button" hlmAlertAction hlmBtn variant="outline" size="sm" (click)="reload()">
                Retry
              </button>
            </div>
          } @else if (visibleCharters().length === 0) {
            <div hlmEmpty class="border-border min-h-64 border">
              <div hlmEmptyHeader>
                @if (hasActiveFilters()) {
                  <div hlmEmptyTitle>No charters match your filters</div>
                  <div hlmEmptyDescription>
                    Try adjusting or clearing the filters to see more results.
                  </div>
                } @else {
                  <div hlmEmptyTitle>No charters found</div>
                  <div hlmEmptyDescription>
                    Create a charter to start assembling enabled items from your packs.
                  </div>
                }
              </div>
              <div hlmEmptyContent>
                @if (hasActiveFilters()) {
                  <button type="button" hlmBtn variant="outline" (click)="resetFilters()">
                    Reset filters
                  </button>
                } @else {
                  <button type="button" hlmBtn (click)="openCreate()">Create charter</button>
                }
              </div>
            </div>
          } @else {
            <app-charter-table
              [charters]="visibleCharters()"
              [activatingCharterId]="activatingCharterId()"
              [exportingCharterId]="exportingCharterId()"
              [removingCharterId]="removingCharterId()"
              (activateCharter)="onActivate($event)"
              (renameCharter)="onRenameRequest($event)"
              (deleteCharter)="onDeleteRequest($event)"
              (exportCharter)="onExport($event)"
            />
          }
        </section>
      </div>
    </div>

    <app-charter-create-dialog
      [(open)]="createOpen"
      [loading]="createLoading()"
      [error]="createError()"
      (created)="onCreate($event)"
    />

    <app-charter-import-dialog
      [(open)]="importOpen"
      [loading]="importLoading()"
      [error]="importError()"
      (imported)="onImport($event)"
    />

    <app-charter-rename-dialog
      [(open)]="renameOpen"
      [charter]="renameTarget()"
      [loading]="renameLoading()"
      [error]="renameError()"
      (renamed)="onRenameConfirmed($event)"
    />

    <app-charter-delete-dialog
      [(open)]="deleteOpen"
      [charter]="deleteTarget()"
      (confirmed)="onDeleteConfirmed($event)"
    />
  `,
})
export class CharterOverviewPage {
  private readonly chartersApi = inject(ChartersApiService);
  private readonly activeCharterStore = inject(ActiveCharterStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly filterSubject = new Subject<CharterListFilters>();

  protected readonly filterForm = signal<CharterFilterFormState>(emptyCharterFilterForm());

  /** Debounced snapshot of `filterForm` (FR-004) — narrowing recomputes only after the 200ms debounce settles. */
  protected readonly debouncedFilters = signal<CharterListFilters>(emptyCharterFilterForm());

  protected readonly listLoading = signal(true);
  protected readonly listError = signal<string | null>(null);

  /** Client-side narrowing applied to every summaries fetch (FR-004) — `getSummaries()` has no filter params. */
  protected readonly visibleCharters = computed(() => {
    const filters = this.debouncedFilters();
    const name = filters.name.trim().toLowerCase();
    return this.activeCharterStore.charters().filter((charter) => {
      if (name && !charter.name.toLowerCase().includes(name)) {
        return false;
      }
      if (filters.activeStatus === 'active-only' && !charter.active) {
        return false;
      }
      if (filters.activeStatus === 'inactive-only' && charter.active) {
        return false;
      }
      if (filters.hasConflictsOnly && !charter.has_conflicts) {
        return false;
      }
      if (filters.createdAtFrom && charter.created < `${filters.createdAtFrom}T00:00:00.000Z`) {
        return false;
      }
      if (filters.createdAtTo && charter.created > `${filters.createdAtTo}T23:59:59.999Z`) {
        return false;
      }
      if (filters.updatedAtFrom && charter.updated < `${filters.updatedAtFrom}T00:00:00.000Z`) {
        return false;
      }
      if (filters.updatedAtTo && charter.updated > `${filters.updatedAtTo}T23:59:59.999Z`) {
        return false;
      }
      return true;
    });
  });

  /** True when any sidebar filter differs from its default. */
  protected readonly hasActiveFilters = computed(() => {
    const form = this.filterForm();
    const empty = emptyCharterFilterForm();
    return (
      form.name.trim() !== empty.name ||
      form.activeStatus !== empty.activeStatus ||
      form.hasConflictsOnly !== empty.hasConflictsOnly ||
      form.createdAtFrom !== empty.createdAtFrom ||
      form.createdAtTo !== empty.createdAtTo ||
      form.updatedAtFrom !== empty.updatedAtFrom ||
      form.updatedAtTo !== empty.updatedAtTo
    );
  });

  protected readonly createOpen = signal(false);
  protected readonly createLoading = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly importOpen = signal(false);
  protected readonly importLoading = signal(false);
  protected readonly importError = signal<string | null>(null);

  protected readonly renameOpen = signal(false);
  protected readonly renameTarget = signal<CharterSummary | null>(null);
  protected readonly renameLoading = signal(false);
  protected readonly renameError = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<CharterSummary | null>(null);

  /** Charter ids with an in-flight activate / rename / delete / export call — drive FR-024 loading UI. */
  protected readonly activatingCharterId = signal<string | null>(null);
  protected readonly renamingCharterId = signal<string | null>(null);
  protected readonly removingCharterId = signal<string | null>(null);
  protected readonly exportingCharterId = signal<string | null>(null);

  constructor() {
    this.filterSubject
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe((filters) => {
        this.debouncedFilters.set(filters);
      });

    void this.reloadCharters();
  }

  protected onFiltersChange(filters: CharterListFilters): void {
    this.filterSubject.next(filters);
  }

  protected openCreate(): void {
    this.createError.set(null);
    this.createOpen.set(true);
  }

  protected openImport(): void {
    this.importError.set(null);
    this.importOpen.set(true);
  }

  protected reload(): void {
    void this.reloadCharters();
  }

  /** Clears every sidebar filter and re-shows the full (unfiltered) list. */
  protected resetFilters(): void {
    this.filterForm.set(emptyCharterFilterForm());
    this.debouncedFilters.set(emptyCharterFilterForm());
  }

  protected async onCreate(name: string): Promise<void> {
    this.createLoading.set(true);
    this.createError.set(null);
    try {
      const result = await this.chartersApi.createCharter(name);
      this.createOpen.set(false);
      toast.success(`“${result.name}” was created successfully.`);
      await this.activeCharterStore.refresh();
    } catch (error) {
      this.createError.set(errorMessage(error, 'Create failed'));
    } finally {
      this.createLoading.set(false);
    }
  }

  protected async onImport(file: File): Promise<void> {
    this.importLoading.set(true);
    this.importError.set(null);
    try {
      const result = await this.chartersApi.importCharter(file);
      this.importOpen.set(false);
      toast.success(`“${result.name}” was imported successfully.`);
      await this.activeCharterStore.refresh();
    } catch (error) {
      // Do not add a ghost charter row — only surface the error in the dialog.
      this.importError.set(errorMessage(error, 'Import failed'));
    } finally {
      this.importLoading.set(false);
    }
  }

  protected async onActivate(charter: CharterSummary): Promise<void> {
    this.activatingCharterId.set(charter.id);
    try {
      await this.chartersApi.activateCharter(charter.id);
      this.activeCharterStore.setActiveCharterId(charter.id);
      toast.success(`“${charter.name}” is now the active charter.`);
    } catch (error) {
      toast.error(errorMessage(error, 'Activate failed'));
    } finally {
      this.activatingCharterId.set(null);
    }
  }

  protected onRenameRequest(charter: CharterSummary): void {
    this.renameTarget.set(charter);
    this.renameError.set(null);
    this.renameOpen.set(true);
  }

  protected async onRenameConfirmed(name: string): Promise<void> {
    const charter = this.renameTarget();
    if (!charter) {
      return;
    }
    this.renameLoading.set(true);
    this.renameError.set(null);
    this.renamingCharterId.set(charter.id);
    try {
      await this.chartersApi.renameCharter(charter.id, name);
      this.renameOpen.set(false);
      toast.success(`“${charter.name}” was renamed to “${name}”.`);
      await this.activeCharterStore.refresh();
    } catch (error) {
      this.renameError.set(errorMessage(error, 'Rename failed'));
    } finally {
      this.renameLoading.set(false);
      this.renamingCharterId.set(null);
    }
  }

  protected onDeleteRequest(charter: CharterSummary): void {
    this.deleteTarget.set(charter);
    this.deleteOpen.set(true);
  }

  protected async onDeleteConfirmed(result: ConfirmDialogResult): Promise<void> {
    const charter = this.deleteTarget();
    if (!charter || !result.confirmed) {
      return;
    }

    this.removingCharterId.set(charter.id);
    try {
      await this.chartersApi.deleteCharter(charter.id);
      this.deleteTarget.set(null);
      toast.success(`“${charter.name}” was deleted.`);
      await this.activeCharterStore.refresh();
    } catch (error) {
      toast.error(errorMessage(error, 'Delete failed'));
    } finally {
      this.removingCharterId.set(null);
    }
  }

  protected async onExport(charter: CharterSummary): Promise<void> {
    this.exportingCharterId.set(charter.id);
    try {
      const result = await this.chartersApi.exportCharter(charter.id);
      downloadBlob(result.blob, result.filename ?? `${charter.name}-charter.zip`);

      if (result.validationStatus === 'errors') {
        toast.error(formatValidationErrors(result.validationErrors));
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Export failed'));
    } finally {
      this.exportingCharterId.set(null);
    }
  }

  private async reloadCharters(): Promise<void> {
    this.listLoading.set(true);
    this.listError.set(null);
    try {
      await this.activeCharterStore.refresh();
    } catch (error) {
      this.listError.set(errorMessage(error, 'Failed to load charters'));
    } finally {
      this.listLoading.set(false);
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
