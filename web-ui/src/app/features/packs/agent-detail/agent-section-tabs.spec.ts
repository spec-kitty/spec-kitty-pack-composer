import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { AgentSectionTabs } from './agent-section-tabs';

const FULL_CONTENT = {
  capabilities: ['Write code'],
  specialization: { 'primary-focus': 'Implementation' },
  collaboration: { 'works-with': ['architect'] },
  'directive-references': [{ code: 'DIRECTIVE_001' }],
  'tactic-references': [{ id: 'tactic-1' }],
};

describe('AgentSectionTabs (FR-008 / FR-009 / NFR-003)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentSectionTabs],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function activePanel(el: HTMLElement): HTMLElement | null {
    return el.querySelector('[role="tabpanel"]:not([hidden])');
  }

  it('with content = {}, only the Raw tab renders/is selectable', () => {
    const fixture = TestBed.createComponent(AgentSectionTabs);
    fixture.componentRef.setInput('content', {});
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const tabList = el.querySelector('[aria-label="Profile sections"]');
    expect(tabList).toBeTruthy();

    const triggers = Array.from(tabList!.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );
    expect(triggers).toEqual(['Raw']);
    expect(activePanel(el)?.querySelector('app-agent-raw-tab')).toBeTruthy();
  });

  it('with the parse-error stub shape, only the Raw tab renders', () => {
    const fixture = TestBed.createComponent(AgentSectionTabs);
    fixture.componentRef.setInput('content', {
      path: '/packs/acme/profiles/broken.yaml',
      error: 'yaml: line 3: bad indentation',
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const tabList = el.querySelector('[aria-label="Profile sections"]');
    const triggers = Array.from(tabList!.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );
    expect(triggers).toEqual(['Raw']);
  });

  it('with a fixture containing all four typed groups, all 5 tabs render in order', () => {
    const fixture = TestBed.createComponent(AgentSectionTabs);
    fixture.componentRef.setInput('content', FULL_CONTENT);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const tabList = el.querySelector('[aria-label="Profile sections"]');
    const triggers = Array.from(tabList!.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );
    expect(triggers).toEqual([
      'Capabilities & Context',
      'Specialization',
      'Collaboration',
      'Directives & Tactics',
      'Raw',
    ]);
  });

  it('switching tabs via tabActivated updates the rendered body', () => {
    const fixture = TestBed.createComponent(AgentSectionTabs);
    fixture.componentRef.setInput('content', FULL_CONTENT);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const expectations: [string, string][] = [
      ['capabilities', 'app-agent-capabilities-tab'],
      ['specialization', 'app-agent-specialization-tab'],
      ['collaboration', 'app-agent-collaboration-tab'],
      ['directives-tactics', 'app-agent-directives-tactics-tab'],
      ['raw', 'app-agent-raw-tab'],
    ];

    for (const [tabId, selector] of expectations) {
      const component = fixture.componentInstance as unknown as {
        onTabActivated(tabId: string): void;
      };
      component.onTabActivated(tabId);
      fixture.detectChanges();
      expect(activePanel(el)?.querySelector(selector)).toBeTruthy();
    }
  });

  it('preserves active tab across a content change that still contains that tab data', () => {
    const fixture = TestBed.createComponent(AgentSectionTabs);
    fixture.componentRef.setInput('content', FULL_CONTENT);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      onTabActivated(tabId: string): void;
    };
    component.onTabActivated('collaboration');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(activePanel(el)?.querySelector('app-agent-collaboration-tab')).toBeTruthy();

    fixture.componentRef.setInput('content', {
      ...FULL_CONTENT,
      capabilities: ['Write more code'],
    });
    fixture.detectChanges();

    expect(activePanel(el)?.querySelector('app-agent-collaboration-tab')).toBeTruthy();
  });

  it('falls back to the first available tab when the active tab disappears after a content change', () => {
    const fixture = TestBed.createComponent(AgentSectionTabs);
    fixture.componentRef.setInput('content', FULL_CONTENT);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      onTabActivated(tabId: string): void;
    };
    component.onTabActivated('collaboration');
    fixture.detectChanges();

    fixture.componentRef.setInput('content', { capabilities: ['Write code'] });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(activePanel(el)?.querySelector('app-agent-capabilities-tab')).toBeTruthy();
  });
});
