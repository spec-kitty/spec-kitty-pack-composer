import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

import type { ArtifactType } from '../models';
import { hasAnyDetailsContent } from './artifact-content-types';
import { ArtifactRawTab } from './artifact-raw-tab';
import { DirectiveContent } from './directive-content';
import { MarkdownContent } from './markdown-content';
import { MissionStepContractContent } from './mission-step-contract-content';
import { ProcedureContent } from './procedure-content';
import { StyleguideContent } from './styleguide-content';
import { TacticContent } from './tactic-content';
import { ToolguideContent } from './toolguide-content';

const DETAILS_TAB_ID = 'details';
const RAW_TAB_ID = 'raw';

interface ArtifactDetailTabDef {
  id: typeof DETAILS_TAB_ID | typeof RAW_TAB_ID;
  label: string;
}

/**
 * Uniform Details/Raw tab orchestrator shared by all 8 new artifact detail
 * pages (FR-005, FR-014). Details' inner content is dispatched by the
 * artifact's own `artifact_type`; Details itself is only shown when
 * `hasAnyDetailsContent()` says there is something to show — Raw is always
 * present and always selectable, regardless of type or Details' presence.
 */
@Component({
  selector: 'app-artifact-detail-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmTabsImports,
    DirectiveContent,
    TacticContent,
    ProcedureContent,
    StyleguideContent,
    ToolguideContent,
    MissionStepContractContent,
    MarkdownContent,
    ArtifactRawTab,
  ],
  host: { class: 'block' },
  template: `
    <hlm-tabs [tab]="activeTab()" class="w-full" (tabActivated)="onTabActivated($event)">
      <hlm-tabs-list
        class="flex h-auto w-full flex-wrap justify-start gap-1"
        aria-label="Artifact sections"
      >
        @for (tab of tabs(); track tab.id) {
          <button type="button" [hlmTabsTrigger]="tab.id">{{ tab.label }}</button>
        }
      </hlm-tabs-list>

      @if (hasDetails()) {
        <div [hlmTabsContent]="detailsTabId" class="mt-4">
          <ng-template hlmTabsContentLazy>
            @switch (artifactType()) {
              @case ('directive') {
                <app-directive-content [content]="content()" />
              }
              @case ('tactic') {
                <app-tactic-content [content]="content()" />
              }
              @case ('procedure') {
                <app-procedure-content [content]="content()" />
              }
              @case ('styleguide') {
                <app-styleguide-content [content]="content()" />
              }
              @case ('toolguide') {
                <app-toolguide-content [content]="content()" />
              }
              @case ('mission_step_contract') {
                <app-mission-step-contract-content [content]="content()" [packId]="packId()" />
              }
              @case ('template') {
                <app-markdown-content [content]="content()" />
              }
              @case ('glossary') {
                <app-markdown-content [content]="content()" />
              }
              @default {
                <!-- 'profile' is out of scope for this component/page family; profile rows
                     route to the separate Agent Profile Detail page, not this one. -->
              }
            }
          </ng-template>
        </div>
      }

      <div [hlmTabsContent]="rawTabId" class="mt-4">
        <ng-template hlmTabsContentLazy>
          <app-artifact-raw-tab [content]="content()" />
        </ng-template>
      </div>
    </hlm-tabs>
  `,
})
export class ArtifactDetailTabs {
  readonly artifactType = input.required<ArtifactType>();
  readonly content = input<unknown>(null);
  readonly packId = input.required<string>();

  protected readonly detailsTabId = DETAILS_TAB_ID;
  protected readonly rawTabId = RAW_TAB_ID;

  protected readonly hasDetails = computed(() =>
    hasAnyDetailsContent(this.artifactType(), this.content()),
  );

  protected readonly tabs = computed((): ArtifactDetailTabDef[] => {
    const tabs: ArtifactDetailTabDef[] = [];
    if (this.hasDetails()) {
      tabs.push({ id: DETAILS_TAB_ID, label: 'Details' });
    }
    tabs.push({ id: RAW_TAB_ID, label: 'Raw' });
    return tabs;
  });

  /** Keep active tab when possible; fall back to first available after a content/type change. */
  protected readonly activeTab = linkedSignal<ArtifactDetailTabDef[], string>({
    source: this.tabs,
    computation: (tabs, previous) => {
      const previousId = previous?.value;
      if (previousId && tabs.some((tab) => tab.id === previousId)) {
        return previousId;
      }
      return tabs[0]?.id ?? RAW_TAB_ID;
    },
  });

  protected onTabActivated(tabId: string): void {
    this.activeTab.set(tabId);
  }
}
