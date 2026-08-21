import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { ConfirmDialog, type ConfirmDialogResult } from '../../../shared';
import type { Pack } from '../models';
import { PackRemoveDialog } from './pack-remove-dialog';
import { makePack } from './pack-test-fixtures';

async function renderDialog(pack: Pack | null) {
  const fixture = TestBed.createComponent(PackRemoveDialog);
  fixture.componentRef.setInput('pack', pack);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const confirm = fixture.debugElement.query(By.directive(ConfirmDialog))
    .componentInstance as ConfirmDialog;
  return { fixture, confirm };
}

describe('PackRemoveDialog', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackRemoveDialog],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('asks for confirmation before removing a pack (FR-014)', async () => {
    const { confirm } = await renderDialog(makePack({ name: 'Doctrine Core' }));

    expect(confirm.title()).toBe('Remove pack');
    expect(confirm.confirmLabel()).toBe('Remove');
    expect(confirm.cancelLabel()).toBe('Cancel');
    expect(confirm.confirmVariant()).toBe('destructive');
    expect(confirm.description()).toContain('Doctrine Core');
  });

  it('offers the disk-delete toggle only for local packs, defaulting to off (FR-015)', async () => {
    const local = await renderDialog(makePack({ origin: 'local' }));
    expect(local.confirm.showToggle()).toBe(true);
    expect(local.confirm.toggleLabel()).toBe('Also delete files from disk');
    expect(local.confirm.toggleValue()).toBe(false);
    expect(local.fixture.componentInstance.deleteFiles()).toBe(false);
  });

  it('hides the disk-delete toggle for remote packs (FR-015)', async () => {
    const remote = await renderDialog(makePack({ id: 'pack-2', origin: 'remote' }));

    expect(remote.confirm.showToggle()).toBe(false);
  });

  it('hides the disk-delete toggle when no pack is targeted (FR-015)', async () => {
    const none = await renderDialog(null);

    expect(none.confirm.showToggle()).toBe(false);
    expect(none.confirm.description()).toBe('Remove this pack from the index?');
  });

  it('re-emits the confirm result including the toggle value (FR-014/FR-015)', async () => {
    const { fixture, confirm } = await renderDialog(makePack({ origin: 'local' }));
    const results: ConfirmDialogResult[] = [];
    const cancellations: ConfirmDialogResult[] = [];
    fixture.componentInstance.confirmed.subscribe((result) => results.push(result));
    fixture.componentInstance.cancelled.subscribe((result) => cancellations.push(result));

    confirm.toggleValue.set(true);
    confirm.confirmed.emit({ confirmed: true, toggleValue: true });
    confirm.cancelled.emit({ confirmed: false, toggleValue: true });

    expect(results).toEqual([{ confirmed: true, toggleValue: true }]);
    expect(cancellations).toEqual([{ confirmed: false, toggleValue: true }]);
  });
});
