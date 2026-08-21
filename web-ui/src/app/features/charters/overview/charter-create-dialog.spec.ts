import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { CharterCreateDialog } from './charter-create-dialog';

async function renderDialog() {
  const fixture = TestBed.createComponent(CharterCreateDialog);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

/** The dialog body is portaled to `document.body`, not `fixture.nativeElement` (mirrors pack-table.spec.ts convention). */
function nameInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('#charter-create-name');
  expect(input, 'no name input rendered').toBeTruthy();
  return input!;
}

function submitButton(): HTMLButtonElement {
  const buttons = Array.from(document.body.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent?.trim() === 'Create');
  expect(button, 'no “Create” submit button').toBeTruthy();
  return button as HTMLButtonElement;
}

function typeName(fixture: { detectChanges: () => void }, value: string): void {
  const input = nameInput();
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('CharterCreateDialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharterCreateDialog],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('disables submit until a name is entered', async () => {
    await renderDialog();

    expect(submitButton().disabled).toBe(true);
  });

  it('emits the trimmed name when the Create button is clicked', async () => {
    const fixture = await renderDialog();
    const emitted: string[] = [];
    fixture.componentInstance.created.subscribe((name) => emitted.push(name));

    typeName(fixture, '  New Charter  ');
    submitButton().click();

    expect(emitted).toEqual(['New Charter']);
  });

  it('emits the trimmed name when Enter is pressed in the name field', async () => {
    const fixture = await renderDialog();
    const emitted: string[] = [];
    fixture.componentInstance.created.subscribe((name) => emitted.push(name));

    typeName(fixture, 'New Charter');
    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(emitted).toEqual(['New Charter']);
  });

  it('does nothing on Enter when the name is blank', async () => {
    const fixture = await renderDialog();
    const emitted: string[] = [];
    fixture.componentInstance.created.subscribe((name) => emitted.push(name));

    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(emitted).toHaveLength(0);
  });

  it('does nothing on Enter while a create is already in flight', async () => {
    const fixture = await renderDialog();
    const emitted: string[] = [];
    fixture.componentInstance.created.subscribe((name) => emitted.push(name));

    typeName(fixture, 'New Charter');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    nameInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(emitted).toHaveLength(0);
  });

  it('resets the name field when the dialog is reopened', async () => {
    const fixture = await renderDialog();
    typeName(fixture, 'Draft name');

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(nameInput().value).toBe('');
  });
});
