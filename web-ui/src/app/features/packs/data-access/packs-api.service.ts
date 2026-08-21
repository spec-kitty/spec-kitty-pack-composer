import { Service, inject } from '@angular/core';

import type {
  PackApiErrorBody,
  PackExportResult,
  PackSummary,
  ParentStatusMap,
  ResolvedPack,
  ValidationStatus,
} from '../models';
import { PocketBaseClient } from './pocketbase.client';

export class PacksApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, status: number, body?: PackApiErrorBody) {
    super(message);
    this.name = 'PacksApiError';
    this.status = status;
    this.code = body?.code;
    this.details = body?.details;
  }
}

const VALIDATION_STATUSES = new Set<ValidationStatus>(['valid', 'errors', 'unknown']);

@Service()
export class PacksApiService {
  private readonly client = inject(PocketBaseClient);

  private get apiBase(): string {
    return `${this.client.baseUrl}/api/packs`;
  }

  async importPack(sourcePath: string): Promise<PackSummary> {
    return this.requestJson<PackSummary>('POST', `${this.apiBase}/import`, {
      body: { source_path: sourcePath },
    });
  }

  async refreshPack(id: string): Promise<PackSummary> {
    return this.requestJson<PackSummary>('POST', `${this.apiBase}/${encodeURIComponent(id)}/refresh`);
  }

  async removePack(id: string, deleteFiles = false): Promise<void> {
    await this.requestJson<void>('DELETE', `${this.apiBase}/${encodeURIComponent(id)}`, {
      body: { delete_files: deleteFiles },
      expectEmpty: true,
    });
  }

  async getParentStatus(): Promise<ParentStatusMap> {
    return this.requestJson<ParentStatusMap>('GET', `${this.apiBase}/parent-status`);
  }

  async getResolved(packId: string): Promise<ResolvedPack> {
    return this.requestJson<ResolvedPack>(
      'GET',
      `${this.apiBase}/${encodeURIComponent(packId)}/resolved`,
    );
  }

  async exportPack(id: string): Promise<PackExportResult> {
    const response = await fetch(`${this.apiBase}/${encodeURIComponent(id)}/export`, {
      method: 'POST',
      headers: { Accept: 'application/zip, application/json' },
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const blob = await response.blob();
    const validationHeader = response.headers.get('X-Pack-Validation-Status');
    const errorsHeader = response.headers.get('X-Pack-Validation-Errors');
    const disposition = response.headers.get('Content-Disposition');

    return {
      blob,
      filename: parseFilenameFromContentDisposition(disposition),
      validationStatus: parseValidationStatus(validationHeader),
      validationErrors: parseValidationErrors(errorsHeader),
    };
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

  private async toApiError(response: Response): Promise<PacksApiError> {
    const body = await readErrorBody(response);
    const message =
      body?.message?.trim() ||
      response.statusText?.trim() ||
      `Request failed with status ${response.status}`;
    return new PacksApiError(message, response.status, body ?? undefined);
  }
}

async function readErrorBody(response: Response): Promise<PackApiErrorBody | null> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = (await response.text()).trim();
    return text ? { message: text } : null;
  }

  try {
    const json: unknown = await response.json();
    if (json && typeof json === 'object' && 'message' in json) {
      const record = json as PackApiErrorBody;
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
