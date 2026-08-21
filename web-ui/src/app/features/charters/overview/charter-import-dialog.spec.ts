import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { CharterImportDialog } from './charter-import-dialog';

function makeFile(name = 'charter-bundle.zip'): File {
  return new File(['zip-bytes'], name, { type: 'application/zip' });
}

async function renderDialog() {
  const fixture = TestBed.createComponent(CharterImportDialog);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

/** The dialog body is portaled to `document.body`, not `fixture.nativeElement` (mirrors pack-table.spec.ts convention). */
function fileInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input, 'no file input rendered').toBeTruthy();
  return input!;
}

function submitButton(): HTMLButtonElement {
  const buttons = Array.from(document.body.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent?.trim() === 'Import');
  expect(button, 'no “Import” submit button').toBeTruthy();
  return button as HTMLButtonElement;
}

function selectFile(fixture: { detectChanges: () => void }, file: File): void {
  const input = fileInput();
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('CharterImportDialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharterImportDialog],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('accepts only .zip files and disables submit until a file is chosen (FR-019/FR-021)', async () => {
    await renderDialog();

    expect(fileInput().accept).toBe('.zip');
    expect(submitButton().disabled).toBe(true);
  });

  it('enables submit once a file is chosen (FR-019/FR-021)', async () => {
    const fixture = await renderDialog();

    selectFile(fixture, makeFile());

    expect(submitButton().disabled).toBe(false);
  });

  it('emits the selected file when submitted, letting the page perform the import (FR-019)', async () => {
    const fixture = await renderDialog();
    const emitted: File[] = [];
    fixture.componentInstance.imported.subscribe((file) => emitted.push(file));

    const file = makeFile();
    selectFile(fixture, file);
    submitButton().click();

    expect(emitted).toEqual([file]);
  });

  it('does nothing when submitted with no file selected', async () => {
    const fixture = await renderDialog();
    const emitted: File[] = [];
    fixture.componentInstance.imported.subscribe((file) => emitted.push(file));

    submitButton().click();

    expect(emitted).toHaveLength(0);
  });

  it('renders the parent-driven error message directly in the dialog body (FR-021)', async () => {
    const fixture = await renderDialog();
    fixture.componentRef.setInput('error', 'Bundle is not a valid charter export.');
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Bundle is not a valid charter export.');
  });

  it('resets the selected file when the dialog is reopened', async () => {
    const fixture = await renderDialog();
    selectFile(fixture, makeFile());
    expect(submitButton().disabled).toBe(false);

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(submitButton().disabled).toBe(true);
  });

  it('disables the file input and submit button while loading', async () => {
    const fixture = await renderDialog();
    selectFile(fixture, makeFile());
    const submit = submitButton();
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(fileInput().disabled).toBe(true);
    expect(submit.disabled).toBe(true);
  });
});
