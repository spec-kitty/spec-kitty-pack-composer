import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import type { BulkAddResult, CharterItem, RelatedItemCandidate, RelatedItemsResult } from '../../charters/models';
import { ActiveCharterStore } from '../../charters/shared';
import { CharterMembershipService } from '../data-access';
import { AddToCharterControl } from './add-to-charter-control';

function relatedItem(overrides: Partial<RelatedItemCandidate> = {}): RelatedItemCandidate {
  return {
    pack_artifact_id: 'pa-related-1',
    artifact_type: 'tactic',
    artifact_id: 'TACTIC_1',
    name: 'Related Tactic',
    pack_name: 'Acme Pack',
    already_in_charter: false,
    ...overrides,
  };
}

class Deferred<T> {
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;
  readonly promise: Promise<T>;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

function charterItem(overrides: Partial<CharterItem> = {}): CharterItem {
  return {
    id: 'item-1',
    charter: 'charter-1',
    pack_artifact: 'pa-1',
    pack_name: 'Acme Pack',
    artifact_type: 'directive',
    artifact_id: 'DIR_001',
    artifact_name: 'Alpha Directive',
    enabled: true,
    ...overrides,
  };
}

class FakeActiveCharterStore {
  private _activeCharterId: string | null = null;

  activeCharterId = (): string | null => this._activeCharterId;
  hasActiveCharter = (): boolean => this._activeCharterId !== null;

  setActiveCharterId(id: string | null): void {
    this._activeCharterId = id;
  }
}

class FakeCharterMembershipService {
  isInActiveCharterCalls: Array<[string, string]> = [];
  isInActiveCharterResult: CharterItem | null = null;
  addResult: CharterItem = charterItem();
  addCalls: string[] = [];
  removeCalls: Array<[string, string]> = [];
  addPending: Deferred<CharterItem> | null = null;
  removePending: Deferred<void> | null = null;

  getRelatedItemsCalls: string[] = [];
  getRelatedItemsResult: RelatedItemsResult | null = { target: { pack_artifact_id: 'pa-1', artifact_type: 'directive', artifact_id: 'DIR_001', name: 'Alpha Directive' }, related: [] };

  addBulkCalls: string[][] = [];
  addBulkResult: BulkAddResult = { items: [charterItem()], added_count: 1, already_present_count: 0 };
  addBulkPending: Deferred<BulkAddResult> | null = null;

  async isInActiveCharter(artifactType: string, artifactId: string): Promise<CharterItem | null> {
    this.isInActiveCharterCalls.push([artifactType, artifactId]);
    return this.isInActiveCharterResult;
  }

  add(packArtifactId: string): Promise<CharterItem> {
    this.addCalls.push(packArtifactId);
    this.addPending = new Deferred<CharterItem>();
    return this.addPending.promise;
  }

  remove(charterId: string, itemId: string): Promise<void> {
    this.removeCalls.push([charterId, itemId]);
    this.removePending = new Deferred<void>();
    return this.removePending.promise;
  }

  async getRelatedItems(packArtifactId: string): Promise<RelatedItemsResult | null> {
    this.getRelatedItemsCalls.push(packArtifactId);
    return this.getRelatedItemsResult;
  }

  addBulk(packArtifactIds: string[]): Promise<BulkAddResult> {
    this.addBulkCalls.push(packArtifactIds);
    this.addBulkPending = new Deferred<BulkAddResult>();
    return this.addBulkPending.promise;
  }
}

describe('AddToCharterControl (FR-007 / FR-008 / FR-009 / FR-010 / FR-024 / NFR-003)', () => {
  let store: FakeActiveCharterStore;
  let membership: FakeCharterMembershipService;

  beforeEach(async () => {
    store = new FakeActiveCharterStore();
    membership = new FakeCharterMembershipService();

    await TestBed.configureTestingModule({
      imports: [AddToCharterControl],
      providers: [
        provideSpartanHlm(),
        { provide: ActiveCharterStore, useValue: store },
        { provide: CharterMembershipService, useValue: membership },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  function render(): ComponentFixture<AddToCharterControl> {
    const fixture = TestBed.createComponent(AddToCharterControl);
    fixture.componentRef.setInput('artifactType', 'directive');
    fixture.componentRef.setInput('artifactId', 'DIR_001');
    fixture.componentRef.setInput('packArtifactId', 'pa-1');
    fixture.componentRef.setInput('artifactName', 'Alpha Directive');
    return fixture;
  }

  async function settle(fixture: ComponentFixture<AddToCharterControl>): Promise<void> {
    fixture.detectChanges();
    for (let round = 0; round < 4; round += 1) {
      await Promise.resolve();
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function button(fixture: ComponentFixture<AddToCharterControl>): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('button');
  }

  it('disables the button with a clear, non-color-only explanation when there is no active charter (FR-008/NFR-003)', async () => {
    const fixture = render();
    await settle(fixture);

    const btn = button(fixture);
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);
    expect(btn!.getAttribute('aria-label')).toContain('Add to Charter');
    expect(btn!.getAttribute('aria-label')).toContain(
      'Create or activate a charter before adding artifacts to it.',
    );
  });

  it('shows "Add to Charter" (enabled) when there is an active charter and the artifact is not a member', async () => {
    store.setActiveCharterId('charter-1');
    membership.isInActiveCharterResult = null;

    const fixture = render();
    await settle(fixture);

    const btn = button(fixture);
    expect(btn!.disabled).toBe(false);
    expect(btn!.textContent?.trim()).toBe('Add to Charter');
    expect(membership.isInActiveCharterCalls).toEqual([['directive', 'DIR_001']]);
  });

  it('clicking "Add to Charter" calls CharterMembershipService.add and flips to "Remove from Charter" without a page reload', async () => {
    store.setActiveCharterId('charter-1');
    membership.isInActiveCharterResult = null;
    membership.addResult = charterItem({ id: 'item-2', charter: 'charter-1' });

    const fixture = render();
    await settle(fixture);

    button(fixture)!.click();
    fixture.detectChanges();
    // The FR-026 related-items check resolves first (no related items here), then add() is called.
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(membership.getRelatedItemsCalls).toEqual(['pa-1']);
    expect(membership.addCalls).toEqual(['pa-1']);
    // Loading state shown for the duration of the call (FR-024).
    expect(button(fixture)).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-loading-indicator')).toBeTruthy();

    membership.addPending!.resolve(membership.addResult);
    await settle(fixture);

    const btn = button(fixture);
    expect(btn!.textContent?.trim()).toBe('Remove from Charter');
  });

  it('does not add directly when getRelatedItems finds related items; opens the confirmation dialog instead (FR-026)', async () => {
    store.setActiveCharterId('charter-1');
    membership.isInActiveCharterResult = null;
    membership.getRelatedItemsResult = {
      target: { pack_artifact_id: 'pa-1', artifact_type: 'directive', artifact_id: 'DIR_001', name: 'Alpha Directive' },
      related: [relatedItem()],
    };

    const fixture = render();
    await settle(fixture);

    button(fixture)!.click();
    await settle(fixture);

    expect(membership.getRelatedItemsCalls).toEqual(['pa-1']);
    expect(membership.addCalls).toEqual([]);
    const dialogTitle = document.body.querySelector('h2[hlmDialogTitle]');
    expect(dialogTitle?.textContent).toContain('Add related items?');
  });

  it('confirming the related-items dialog calls addBulk with the directive plus checked related ids (FR-026)', async () => {
    store.setActiveCharterId('charter-1');
    membership.isInActiveCharterResult = null;
    const related = relatedItem();
    membership.getRelatedItemsResult = {
      target: { pack_artifact_id: 'pa-1', artifact_type: 'directive', artifact_id: 'DIR_001', name: 'Alpha Directive' },
      related: [related],
    };
    membership.addBulkResult = {
      items: [charterItem({ id: 'item-2' }), charterItem({ id: 'item-3', artifact_type: 'tactic', artifact_id: 'TACTIC_1' })],
      added_count: 2,
      already_present_count: 0,
    };

    const fixture = render();
    await settle(fixture);

    button(fixture)!.click();
    await settle(fixture);

    const confirmButton = Array.from(
      document.body.querySelectorAll('.cdk-overlay-container button'),
    ).find((candidate) => candidate.textContent?.trim().startsWith('Add')) as HTMLButtonElement;
    confirmButton.click();
    fixture.detectChanges();

    expect(membership.addBulkCalls).toEqual([['pa-1', 'pa-related-1']]);

    membership.addBulkPending!.resolve(membership.addBulkResult);
    await settle(fixture);

    expect(button(fixture)!.textContent?.trim()).toBe('Remove from Charter');
  });

  it('cancelling the related-items dialog adds nothing', async () => {
    store.setActiveCharterId('charter-1');
    membership.isInActiveCharterResult = null;
    membership.getRelatedItemsResult = {
      target: { pack_artifact_id: 'pa-1', artifact_type: 'directive', artifact_id: 'DIR_001', name: 'Alpha Directive' },
      related: [relatedItem()],
    };

    const fixture = render();
    await settle(fixture);

    button(fixture)!.click();
    await settle(fixture);

    const cancelButton = Array.from(
      document.body.querySelectorAll('.cdk-overlay-container button'),
    ).find((candidate) => candidate.textContent?.trim() === 'Cancel') as HTMLButtonElement;
    cancelButton.click();
    await settle(fixture);

    expect(membership.addCalls).toEqual([]);
    expect(membership.addBulkCalls).toEqual([]);
    expect(button(fixture)!.textContent?.trim()).toBe('Add to Charter');
  });

  it('shows "Remove from Charter" when the artifact is already a member, and clicking removes it and flips back', async () => {
    store.setActiveCharterId('charter-1');
    membership.isInActiveCharterResult = charterItem({ id: 'item-1', charter: 'charter-1' });

    const fixture = render();
    await settle(fixture);

    const btn = button(fixture);
    expect(btn!.textContent?.trim()).toBe('Remove from Charter');

    btn!.click();
    fixture.detectChanges();
    expect(membership.removeCalls).toEqual([['charter-1', 'item-1']]);

    membership.removePending!.resolve();
    await settle(fixture);

    expect(button(fixture)!.textContent?.trim()).toBe('Add to Charter');
  });

  it('emits membershipChanged after a successful add/remove', async () => {
    store.setActiveCharterId('charter-1');
    membership.isInActiveCharterResult = null;

    const fixture = render();
    let emitted = 0;
    fixture.componentInstance.membershipChanged.subscribe(() => {
      emitted += 1;
    });
    await settle(fixture);

    button(fixture)!.click();
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    membership.addPending!.resolve(charterItem());
    await settle(fixture);

    expect(emitted).toBe(1);
  });

  it('membershipOverride mode never performs its own network lookup and relies entirely on the parent-supplied value', async () => {
    store.setActiveCharterId('charter-1');

    const fixture = render();
    fixture.componentRef.setInput('membershipOverride', charterItem({ id: 'item-9', charter: 'charter-1' }));
    await settle(fixture);

    expect(membership.isInActiveCharterCalls).toEqual([]);
    expect(button(fixture)!.textContent?.trim()).toBe('Remove from Charter');
  });

  it('membershipOverride mode with null (not a member) shows "Add to Charter" without a lookup', async () => {
    store.setActiveCharterId('charter-1');

    const fixture = render();
    fixture.componentRef.setInput('membershipOverride', null);
    await settle(fixture);

    expect(membership.isInActiveCharterCalls).toEqual([]);
    expect(button(fixture)!.textContent?.trim()).toBe('Add to Charter');
    expect(button(fixture)!.disabled).toBe(false);
  });
});
