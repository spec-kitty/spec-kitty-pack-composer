import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

import type { AgentProfileSectionTabDef } from '../models';
import { AGENT_RAW_TAB_ID, buildAgentSectionTabs } from './agent-section-types';
import { AgentCapabilitiesTab } from './agent-capabilities-tab';
import { AgentCollaborationTab } from './agent-collaboration-tab';
import { AgentDirectivesTacticsTab } from './agent-directives-tactics-tab';
import { AgentRawTab } from './agent-raw-tab';
import { AgentSpecializationTab } from './agent-specialization-tab';

/**
 * Data-driven section tabs from a profile's `content` + always-on Raw (FR-008, FR-009).
 */
@Component({
  selector: 'app-agent-section-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmTabsImports,
    AgentCapabilitiesTab,
    AgentSpecializationTab,
    AgentCollaborationTab,
    AgentDirectivesTacticsTab,
    AgentRawTab,
  ],
  host: { class: 'block' },
  template: `
    <hlm-tabs [tab]="activeTab()" class="w-full" (tabActivated)="onTabActivated($event)">
      <hlm-tabs-list
        class="flex h-auto w-full flex-wrap justify-start gap-1"
        aria-label="Profile sections"
      >
        @for (tab of tabs(); track tab.id) {
          <button type="button" [hlmTabsTrigger]="tab.id">{{ tab.label }}</button>
        }
      </hlm-tabs-list>
      @for (tab of tabs(); track tab.id) {
        <div [hlmTabsContent]="tab.id" class="mt-4">
          <ng-template hlmTabsContentLazy>
            @switch (tab.id) {
              @case ('capabilities') {
                <app-agent-capabilities-tab [content]="content()" />
              }
              @case ('specialization') {
                <app-agent-specialization-tab [content]="content()" />
              }
              @case ('collaboration') {
                <app-agent-collaboration-tab [content]="content()" />
              }
              @case ('directives-tactics') {
                <app-agent-directives-tactics-tab [content]="content()" />
              }
              @default {
                <app-agent-raw-tab [content]="content()" />
              }
            }
          </ng-template>
        </div>
      }
    </hlm-tabs>
  `,
})
export class AgentSectionTabs {
  readonly content = input<unknown>(null);

  protected readonly tabs = computed(() => buildAgentSectionTabs(this.content()));

  /** Keep active tab when possible; fall back to first available after refresh. */
  protected readonly activeTab = linkedSignal<AgentProfileSectionTabDef[], string>({
    source: this.tabs,
    computation: (tabs, previous) => {
      const previousId = previous?.value;
      if (previousId && tabs.some((tab) => tab.id === previousId)) {
        return previousId;
      }
      return tabs[0]?.id ?? AGENT_RAW_TAB_ID;
    },
  });

  protected onTabActivated(tabId: string): void {
    this.activeTab.set(tabId);
  }
}
