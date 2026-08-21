import { InjectionToken, Service, inject } from '@angular/core';
import PocketBase from 'pocketbase';

/** Default PocketBase base URL for local Go server (reads + custom `/api/packs` routes). */
export const DEFAULT_POCKETBASE_URL = 'http://127.0.0.1:8090';

/**
 * Override the PocketBase base URL (e.g. in tests or deployment config).
 * When unset, {@link DEFAULT_POCKETBASE_URL} is used.
 */
export const POCKETBASE_URL = new InjectionToken<string>('POCKETBASE_URL', {
  providedIn: 'root',
  factory: () => DEFAULT_POCKETBASE_URL,
});

/**
 * Root PocketBase JS SDK client.
 * CORS: the Angular origin must be allowed by the PocketBase server (configure in WP01 / server README).
 */
@Service()
export class PocketBaseClient {
  readonly pb = new PocketBase(inject(POCKETBASE_URL));

  get baseUrl(): string {
    return this.pb.baseUrl.replace(/\/$/, '');
  }
}
