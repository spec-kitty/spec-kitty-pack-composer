import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import type { RelatedItemCandidate } from '../models';
import { CharterAddRelatedDialog } from './charter-add-related-dialog';

const RELATED_ITEMS: RelatedItemCandidate[] = [
  {
    pack_artifact_id: 'pa-tactic-1',
    artifact_type: 'tactic',
    artifact_id: 'TACTIC_1',
    name: 'Tactic One',
    pack_name: 'Pack A',
    already_in_charter: false,
  },
  {
    pack_artifact_id: 'pa-procedure-1',
    artifact_type: 'procedure',
    artifact_id: 'PROCEDURE_1',
    name: 'Procedure One',
    pack_name: 'Pack A',
    already_in_charter: true,
  },
];

async function renderDialog(relatedItems: RelatedItemCandidate[] = RELATED_ITEMS) {
  const fixture = TestBed.createComponent(CharterAddRelatedDialog);
  fixture.componentRef.setInput('open', true);
  fixture.componentRef.setInput('targetName', 'Directive One');
  fixture.componentRef.setInput('relatedItems', relatedItems);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function checkboxFor(name: string): HTMLElement {
  const label = Array.from(document.body.querySelectorAll('label')).find((candidate) =>
    candidate.textContent?.includes(name),
  );
  expect(label, `no label for “${name}”`).toBeTruthy();
  const checkboxId = label!.getAttribute('for');
  const checkbox = document.body.querySelector<HTMLElement>(`[id="${checkboxId}"]`);
  expect(checkbox, `no checkbox for “${name}”`).toBeTruthy();
  return checkbox!;
}

function confirmButton(): HTMLButtonElement {
  const buttons = Array.from(document.body.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent?.trim().startsWith('Add'));
  expect(button, 'no “Add N items” submit button').toBeTruthy();
  return button as HTMLButtonElement;
}

function cancelButton(): HTMLButtonElement {
  const buttons = Array.from(document.body.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent?.trim() === 'Cancel');
  expect(button, 'no “Cancel” button').toBeTruthy();
  return button as HTMLButtonElement;
}

describe('CharterAddRelatedDialog (FR-026)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharterAddRelatedDialog],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('pre-checks every related item that is not already in the charter', async () => {
    await renderDialog();

    expect(confirmButton().textContent?.trim()).toBe('Add 2 items');
  });

  it('renders already-in-charter items as disabled and unaffecting the confirm count', async () => {
    await renderDialog();

    const alreadyInCheckbox = checkboxFor('Procedure One');
    expect(alreadyInCheckbox.getAttribute('data-disabled')).not.toBeNull();
  });

  it('emits only the checked related item ids on confirm, excluding the target directive', async () => {
    const fixture = await renderDialog();
    const emitted: string[][] = [];
    fixture.componentInstance.confirmed.subscribe((ids) => emitted.push(ids));

    confirmButton().click();

    expect(emitted).toEqual([['pa-tactic-1']]);
  });

  it('unchecking a related item excludes it from the confirm payload', async () => {
    const fixture = await renderDialog();
    const emitted: string[][] = [];
    fixture.componentInstance.confirmed.subscribe((ids) => emitted.push(ids));

    checkboxFor('Tactic One').click();
    fixture.detectChanges();
    expect(confirmButton().textContent?.trim()).toBe('Add 1 item');

    confirmButton().click();

    expect(emitted).toEqual([[]]);
  });

  it('emits cancelled and nothing on confirmed when Cancel is clicked', async () => {
    const fixture = await renderDialog();
    const confirmedEmitted: string[][] = [];
    let cancelledCount = 0;
    fixture.componentInstance.confirmed.subscribe((ids) => confirmedEmitted.push(ids));
    fixture.componentInstance.cancelled.subscribe(() => cancelledCount++);

    cancelButton().click();

    expect(cancelledCount).toBe(1);
    expect(confirmedEmitted).toHaveLength(0);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('disables Cancel and Confirm while loading', async () => {
    const fixture = await renderDialog();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(cancelButton().disabled).toBe(true);
    expect(confirmButton().disabled).toBe(true);
  });

  it('re-derives the pre-checked selection when a new relatedItems list arrives', async () => {
    const fixture = await renderDialog([RELATED_ITEMS[0]]);
    expect(confirmButton().textContent?.trim()).toBe('Add 2 items');

    fixture.componentRef.setInput('relatedItems', [RELATED_ITEMS[0], RELATED_ITEMS[0]].map((item, i) => ({
      ...item,
      pack_artifact_id: `${item.pack_artifact_id}-${i}`,
    })));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmButton().textContent?.trim()).toBe('Add 3 items');
  });
});
