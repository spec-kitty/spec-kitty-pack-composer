import { Service, inject } from '@angular/core';

import type { ValidationStatus } from '../../packs/models';
import { PocketBaseClient } from '../../packs/data-access/pocketbase.client';
import type {
  AddItemRequest,
  AddItemsBulkRequest,
  BulkAddResult,
  CharterApiErrorBody,
  CharterExportResult,
  CharterGrid,
  CharterItem,
  CharterSummary,
  RelatedItemsResult,
  ToggleResult,
} from '../models';

export class CharterApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, status: number, body?: CharterApiErrorBody) {
    super(message);
    this.name = 'CharterApiError';
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
  }
}

const VALIDATION_STATUSES = new Set<ValidationStatus>(['valid', 'errors', 'unknown']);

@Service()
export class ChartersApiService {
  private readonly client = inject(PocketBaseClient);

  private get apiBase(): string {
    return `${this.client.baseUrl}/api/charters`;
  }

  async createCharter(name: string): Promise<CharterSummary> {
    return this.requestJson<CharterSummary>('POST', this.apiBase, { body: { name } });
  }

  async activateCharter(id: string): Promise<CharterSummary> {
    return this.requestJson<CharterSummary>(
      'POST',
      `${this.apiBase}/${encodeURIComponent(id)}/activate`,
    );
  }

  async renameCharter(id: string, name: string): Promise<CharterSummary> {
    return this.requestJson<CharterSummary>('PATCH', `${this.apiBase}/${encodeURIComponent(id)}`, {
      body: { name },
    });
  }

  async deleteCharter(id: string): Promise<void> {
    await this.requestJson<void>('DELETE', `${this.apiBase}/${encodeURIComponent(id)}`, {
      expectEmpty: true,
    });
  }

  /** Overview-table data with `enabled_item_count`/`has_conflicts` — do not use `charters-read.service.ts`'s `list()` for this. */
  async getSummaries(): Promise<CharterSummary[]> {
    return this.requestJson<CharterSummary[]>('GET', `${this.apiBase}/summaries`);
  }

  async getGrid(id: string): Promise<CharterGrid> {
    return this.requestJson<CharterGrid>('GET', `${this.apiBase}/${encodeURIComponent(id)}/grid`);
  }

  async addItem(charterId: string, packArtifactId: string): Promise<CharterItem> {
    const body: AddItemRequest = { pack_artifact_id: packArtifactId };
    return this.requestJson<CharterItem>(
      'POST',
      `${this.apiBase}/${encodeURIComponent(charterId)}/items`,
      { body },
    );
  }

  /** FR-026: every artifact whose own `references` field points back at this directive; empty for non-directive targets. */
  async getRelatedItems(charterId: string, packArtifactId: string): Promise<RelatedItemsResult> {
    return this.requestJson<RelatedItemsResult>(
      'GET',
      `${this.apiBase}/${encodeURIComponent(charterId)}/items/related?pack_artifact_id=${encodeURIComponent(packArtifactId)}`,
    );
  }

  /** Adds every listed pack artifact to the charter in one call (FR-026) — used for "directive + confirmed related items". */
  async addItemsBulk(charterId: string, packArtifactIds: string[]): Promise<BulkAddResult> {
    const body: AddItemsBulkRequest = { pack_artifact_ids: packArtifactIds };
    return this.requestJson<BulkAddResult>(
      'POST',
      `${this.apiBase}/${encodeURIComponent(charterId)}/items/bulk`,
      { body },
    );
  }

  async removeItem(charterId: string, itemId: string): Promise<void> {
    await this.requestJson<void>(
      'DELETE',
      `${this.apiBase}/${encodeURIComponent(charterId)}/items/${encodeURIComponent(itemId)}`,
      { expectEmpty: true },
    );
  }

  async toggleItem(charterId: string, itemId: string, enabled: boolean): Promise<ToggleResult> {
    return this.requestJson<ToggleResult>(
      'POST',
      `${this.apiBase}/${encodeURIComponent(charterId)}/items/${encodeURIComponent(itemId)}/toggle`,
      { body: { enabled } },
    );
  }

  async exportCharter(id: string): Promise<CharterExportResult> {
    const response = await fetch(`${this.apiBase}/${encodeURIComponent(id)}/export`, {
      method: 'POST',
      headers: { Accept: 'application/zip, application/json' },
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const blob = await response.blob();
    const validationHeader = response.headers.get('X-Charter-Validation-Status');
    const errorsHeader = response.headers.get('X-Charter-Validation-Errors');
    const disposition = response.headers.get('Content-Disposition');

    return {
      blob,
      filename: parseFilenameFromContentDisposition(disposition),
      validationStatus: parseValidationStatus(validationHeader),
      validationErrors: parseValidationErrors(errorsHeader),
    };
  }

  async importCharter(file: File): Promise<CharterSummary> {
    const formData = new FormData();
    formData.append('bundle', file);

    const response = await fetch(`${this.apiBase}/import`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    return (await response.json()) as CharterSummary;
  }

  private async requestJson<T>(
    method: string,
    url: string,
    options: { body?: unknown; expectEmpty?: boolean } = {},
  ): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    if (options.expectEmpty || response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async toApiError(response: Response): Promise<CharterApiError> {
    const body = await readErrorBody(response);
    const message =
      body?.message?.trim() ||
      response.statusText?.trim() ||
      `Request failed with status ${response.status}`;
    return new CharterApiError(message, response.status, body ?? undefined);
  }
}

async function readErrorBody(response: Response): Promise<CharterApiErrorBody | null> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = (await response.text()).trim();
    return text ? { message: text } : null;
  }

  try {
    const json: unknown = await response.json();
    if (json && typeof json === 'object' && 'message' in json) {
      const record = json as CharterApiErrorBody;
      if (typeof record.message === 'string') {
        return record;
      }
    }
    return { message: `Request failed with status ${response.status}`, details: asRecord(json) };
  } catch {
    return { message: `Request failed with status ${response.status}` };
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function parseValidationStatus(header: string | null): ValidationStatus | null {
  if (!header) {
    return null;
  }
  return VALIDATION_STATUSES.has(header as ValidationStatus) ? (header as ValidationStatus) : null;
}

function parseValidationErrors(header: string | null): unknown | null {
  if (!header) {
    return null;
  }
  try {
    return JSON.parse(header) as unknown;
  } catch {
    return header;
  }
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].trim());
    } catch {
      return utfMatch[1].trim();
    }
  }
  const plainMatch = /filename="([^"]+)"/i.exec(header) ?? /filename=([^;]+)/i.exec(header);
  return plainMatch?.[1]?.trim() ?? null;
}
