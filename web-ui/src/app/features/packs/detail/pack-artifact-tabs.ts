import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

import { CharterMembershipService } from '../data-access';
import type { CharterItem } from '../../charters/models';
import type { ArtifactType, Pack } from '../models';
import { RAW_TAB_ID, buildPackTabs, type PackTabDef } from './artifact-types';
import { PackArtifactTable } from './pack-artifact-table';
import { PackBehaviouralTab } from './pack-behavioural-tab';
import { PackProfilesTab } from './pack-profiles-tab';
import { PackRawTab } from './pack-raw-tab';

/**
 * Conditional typed tabs from `stats.by_type` + always-on Raw (FR-018, FR-019).
 */
@Component({
  selector: 'app-pack-artifact-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmTabsImports, PackArtifactTable, PackBehaviouralTab, PackProfilesTab, PackRawTab],
  host: {
    class: 'block',
  },
  template: `
    <hlm-tabs [tab]="activeTab()" class="w-full" (tabActivated)="onTabActivated($event)">
      <hlm-tabs-list
        class="flex h-auto w-full flex-wrap justify-start gap-1"
        aria-label="Pack artifacts"
      >
        @for (tab of tabs(); track tab.id) {
          <button type="button" [hlmTabsTrigger]="tab.id">{{ tab.label }}</button>
        }
      </hlm-tabs-list>

      @for (tab of tabs(); track tab.id) {
        <div [hlmTabsContent]="tab.id" class="mt-4">
          <ng-template hlmTabsContentLazy>
            @if (tab.id === rawTabId) {
              <app-pack-raw-tab [snapshot]="pack().raw_snapshot" />
            } @else if (tab.id === 'profile') {
              <app-pack-profiles-tab [packId]="pack().id" [reloadToken]="reloadToken()" />
            } @else if (tab.id === 'behavioural') {
              <app-pack-behavioural-tab
                [packId]="pack().id"
                [memberTypes]="behaviouralTypesFor(tab)"
                [reloadToken]="reloadToken()"
                [membership]="membership()"
                (membershipChanged)="reloadMembership()"
              />
            } @else if (tab.artifactTypes?.[0]; as artifactType) {
              <app-pack-artifact-table
                [packId]="pack().id"
                [artifactType]="artifactType"
                [reloadToken]="reloadToken()"
                [membership]="membership()"
                (membershipChanged)="reloadMembership()"
              />
            }
          </ng-template>
        </div>
      }
    </hlm-tabs>
  `,
})
export class PackArtifactTabs {
  private readonly charterMembership = inject(CharterMembershipService);

  readonly pack = input.required<Pack>();
  readonly reloadToken = input(0);

  protected readonly rawTabId = RAW_TAB_ID;

  /**
   * Loaded once per pack view (not once per typed tab) and passed down to every
   * `app-pack-artifact-table` as `membershipOverride` batch data (FR-007) — avoids
   * N+1 membership lookups across many rows/tabs.
   */
  protected readonly membership = signal<Map<string, CharterItem>>(new Map());

  protected readonly tabs = computed(() => buildPackTabs(this.pack().stats));

  /** Keep active tab when possible; fall back to first available after refresh. */
  protected readonly activeTab = linkedSignal<PackTabDef[], string>({
    source: this.tabs,
    computation: (tabs, previous) => {
      const previousId = previous?.value;
      if (previousId && tabs.some((tab) => tab.id === previousId)) {
        return previousId;
      }
      return tabs[0]?.id ?? RAW_TAB_ID;
    },
  });

  constructor() {
    effect(() => {
      const packId = this.pack().id;
      void this.loadMembership(packId);
    });
  }

  protected onTabActivated(tabId: string): void {
    this.activeTab.set(tabId);
  }

  /**
   * FR-005's "no empty section" rule for the Behavioural tab specifically —
   * `buildPackTabs()` only decides the tab itself is present, not which of its
   * member types individually have artifacts.
   */
  protected behaviouralTypesFor(tab: PackTabDef): ArtifactType[] {
    const byType = this.pack().stats?.by_type ?? {};
    return (tab.artifactTypes ?? []).filter((type) => (byType[type] ?? 0) > 0);
  }

  /** Re-fetched (not optimistically patched) after any row's add/remove so every open tab stays correct. */
  protected reloadMembership(): void {
    void this.loadMembership(this.pack().id);
  }

  private async loadMembership(packId: string): Promise<void> {
    try {
      const result = await this.charterMembership.listMembershipForPack(packId);
      this.membership.set(result);
    } catch {
      this.membership.set(new Map());
    }
  }
}
