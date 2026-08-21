import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import type { CharterGridCard as CharterGridCardModel } from '../models';
import { CharterGridCard } from './charter-grid-card';

function makeCard(overrides: Partial<CharterGridCardModel> = {}): CharterGridCardModel {
  return {
    artifact_type: 'directive',
    artifact_id: 'artifact-1',
    pack_artifact_id: 'record-1',
    artifact_name: 'Sample Directive',
    pack_name: 'Doctrine Core',
    charter_item_id: null,
    in_charter: false,
    enabled: false,
    conflicting: false,
    missing_source: false,
    ...overrides,
  };
}

async function renderCard(card: CharterGridCardModel) {
  const fixture = TestBed.createComponent(CharterGridCard);
  fixture.componentRef.setInput('card', card);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('CharterGridCard (FR-013/FR-014/FR-015/FR-022)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharterGridCard],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders an "Add to Charter" action when not in charter', async () => {
    const fixture = await renderCard(makeCard({ in_charter: false }));
    const el = fixture.nativeElement as HTMLElement;

    const addButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Add to Charter'),
    );
    expect(addButton).toBeTruthy();
    expect(el.querySelector('hlm-switch')).toBeNull();
  });

  it('emits add with the card when the "Add to Charter" button is clicked', async () => {
    const card = makeCard({ in_charter: false, artifact_id: 'artifact-42' });
    const fixture = await renderCard(card);
    const added: CharterGridCardModel[] = [];
    fixture.componentInstance.add.subscribe((emitted) => added.push(emitted));

    const el = fixture.nativeElement as HTMLElement;
    const addButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Add to Charter'),
    );
    addButton!.click();

    expect(added).toEqual([card]);
  });

  it('shows a spinner and hides the label instead of shifting layout while busy', async () => {
    const fixture = await renderCard(makeCard({ in_charter: false }));
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const addButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.getAttribute('aria-label')?.startsWith('Add'),
    ) as HTMLButtonElement | undefined;

    expect(addButton).toBeTruthy();
    expect(addButton?.disabled).toBe(true);
    expect(addButton?.getAttribute('aria-busy')).toBe('true');
    expect(addButton?.textContent).not.toContain('Add to Charter');
    expect(el.querySelector('ng-icon[name="lucideLoader2"]')).toBeTruthy();
  });

  it('emits nothing when the button is clicked while busy (button is disabled)', async () => {
    const card = makeCard({ in_charter: false });
    const fixture = await renderCard(card);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const added: CharterGridCardModel[] = [];
    fixture.componentInstance.add.subscribe((emitted) => added.push(emitted));

    const el = fixture.nativeElement as HTMLElement;
    const addButton = el.querySelector<HTMLButtonElement>('button[aria-busy="true"]');
    addButton!.click();

    expect(added).toEqual([]);
  });

  it('disables the "Add to Charter" action when pack_artifact_id is missing', async () => {
    const fixture = await renderCard(makeCard({ in_charter: false, pack_artifact_id: undefined }));
    const el = fixture.nativeElement as HTMLElement;

    const addButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Add to Charter'),
    ) as HTMLButtonElement | undefined;
    expect(addButton).toBeTruthy();
    expect(addButton?.disabled).toBe(true);
  });

  it('renders an enabled, non-disabled switch for an enabled in-charter item', async () => {
    const fixture = await renderCard(
      makeCard({ in_charter: true, enabled: true, charter_item_id: 'item-1' }),
    );
    const el = fixture.nativeElement as HTMLElement;

    const switchButton = el.querySelector<HTMLButtonElement>('brn-switch button[role="switch"]');
    expect(switchButton).toBeTruthy();
    expect(switchButton?.disabled).toBe(false);
    expect(el.textContent).toContain('Enabled');
  });

  it('renders a disabled switch and non-color-only "Missing source" cue when missing_source is true', async () => {
    const fixture = await renderCard(
      makeCard({
        in_charter: true,
        enabled: false,
        missing_source: true,
        charter_item_id: 'item-2',
      }),
    );
    const el = fixture.nativeElement as HTMLElement;

    // Assert the actual disabled state on the underlying control, not just a CSS class.
    const switchButton = el.querySelector<HTMLButtonElement>('brn-switch button[role="switch"]');
    expect(switchButton).toBeTruthy();
    expect(switchButton?.disabled).toBe(true);

    // Non-color-only: icon + text label, not color alone.
    expect(el.querySelector('ng-icon')).toBeTruthy();
    expect(el.textContent).toContain('Missing source');
  });

  it('shows a non-color-only "Conflict" badge and a resolve action on a disabled conflicting card', async () => {
    const fixture = await renderCard(
      makeCard({
        in_charter: true,
        enabled: false,
        conflicting: true,
        charter_item_id: 'item-3',
      }),
    );
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Conflict');
    const resolveButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Use this source'),
    );
    expect(resolveButton).toBeTruthy();
  });

  it('does not show the resolve action on an already-enabled conflicting card', async () => {
    const fixture = await renderCard(
      makeCard({
        in_charter: true,
        enabled: true,
        conflicting: true,
        charter_item_id: 'item-4',
      }),
    );
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Conflict');
    const resolveButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Use this source'),
    );
    expect(resolveButton).toBeFalsy();
  });

  it('emits resolveConflict with the card when the resolve action is clicked', async () => {
    const card = makeCard({
      in_charter: true,
      enabled: false,
      conflicting: true,
      charter_item_id: 'item-5',
    });
    const fixture = await renderCard(card);
    const resolved: CharterGridCardModel[] = [];
    fixture.componentInstance.resolveConflict.subscribe((emitted) => resolved.push(emitted));

    const el = fixture.nativeElement as HTMLElement;
    const resolveButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Use this source'),
    );
    resolveButton!.click();

    expect(resolved).toEqual([card]);
  });

  it('emits toggle with the card and new value when the switch is toggled', async () => {
    const card = makeCard({ in_charter: true, enabled: false, charter_item_id: 'item-6' });
    const fixture = await renderCard(card);
    const toggled: { card: CharterGridCardModel; enabled: boolean }[] = [];
    fixture.componentInstance.toggle.subscribe((emitted) => toggled.push(emitted));

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('brn-switch button, button[role="switch"]');
    expect(button).toBeTruthy();
    button!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(toggled).toEqual([{ card, enabled: true }]);
  });

  it('renders a "Remove" action for an in-charter item', async () => {
    const fixture = await renderCard(
      makeCard({ in_charter: true, enabled: true, charter_item_id: 'item-7' }),
    );
    const el = fixture.nativeElement as HTMLElement;

    const removeButton = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Sample Directive from charter"]',
    );
    expect(removeButton).toBeTruthy();
    expect(removeButton?.disabled).toBe(false);
  });

  it('does not render a "Remove" action when not in charter', async () => {
    const fixture = await renderCard(makeCard({ in_charter: false }));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('ng-icon[name="lucideTrash2"]')).toBeNull();
  });

  it('emits remove with the card when the "Remove" action is clicked', async () => {
    const card = makeCard({ in_charter: true, enabled: true, charter_item_id: 'item-8' });
    const fixture = await renderCard(card);
    const removed: CharterGridCardModel[] = [];
    fixture.componentInstance.remove.subscribe((emitted) => removed.push(emitted));

    const el = fixture.nativeElement as HTMLElement;
    const removeButton = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Sample Directive from charter"]',
    );
    removeButton!.click();

    expect(removed).toEqual([card]);
  });

  it('shows the "Remove" action as disabled and busy while removing() is true, and emits nothing on click', async () => {
    const card = makeCard({ in_charter: true, enabled: true, charter_item_id: 'item-9' });
    const fixture = await renderCard(card);
    fixture.componentRef.setInput('removing', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const removed: CharterGridCardModel[] = [];
    fixture.componentInstance.remove.subscribe((emitted) => removed.push(emitted));

    const el = fixture.nativeElement as HTMLElement;
    const removeButton = el.querySelector<HTMLButtonElement>('button[aria-busy="true"]');
    expect(removeButton).toBeTruthy();
    expect(removeButton?.disabled).toBe(true);
    expect(el.querySelector('ng-icon[name="lucideLoader2"]')).toBeTruthy();

    removeButton!.click();
    expect(removed).toEqual([]);
  });
});
