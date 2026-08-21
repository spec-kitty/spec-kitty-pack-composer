import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { PackDetailHeader } from './pack-detail-header';
import { makePack } from './test-fixtures';

describe('PackDetailHeader (FR-016 / FR-023 / NFR-002)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackDetailHeader],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders name, version/origin/validation badges, updated time, and Refresh', () => {
    const fixture = TestBed.createComponent(PackDetailHeader);
    fixture.componentRef.setInput(
      'pack',
      makePack({
        name: 'Header Pack',
        project_key: 'acme-pack',
        version: '9.9.9',
        origin: 'remote',
        validation_status: 'errors',
        updated_at: '2026-03-15T08:30:00.000Z',
      }),
    );
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Header Pack');

    const badges = el.querySelector('[aria-label="Pack badges"]');
    expect(badges?.textContent).toContain('acme-pack');
    expect(badges?.textContent).toContain('v9.9.9');
    expect(badges?.textContent).toContain('Remote');
    expect(badges?.textContent).toContain('Errors');
    expect(el.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-03-15T08:30:00.000Z',
    );

    const refresh = Array.from(el.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Refresh'),
    );
    expect(refresh).toBeTruthy();
    expect(refresh!.disabled).toBe(false);

    // Spartan badge / button hosts (NFR-002).
    expect(el.querySelector('[hlmbadge], [hlmBadge], span[class*="badge"]')).toBeTruthy();
  });

  it('omits the project key badge when project_key is empty', () => {
    const fixture = TestBed.createComponent(PackDetailHeader);
    fixture.componentRef.setInput('pack', makePack({ project_key: undefined }));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-label^="Project key"]')).toBeNull();
  });

  it('disables Refresh and shows busy state while refreshing (FR-023)', () => {
    const fixture = TestBed.createComponent(PackDetailHeader);
    fixture.componentRef.setInput('pack', makePack());
    fixture.componentRef.setInput('refreshing', true);
    fixture.detectChanges();

    const refresh = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Refreshing'));
    expect(refresh).toBeTruthy();
    expect(refresh!.disabled).toBe(true);
    expect(refresh!.getAttribute('aria-busy')).toBe('true');
  });

  it('emits refresh when the Refresh button is clicked', () => {
    const fixture = TestBed.createComponent(PackDetailHeader);
    fixture.componentRef.setInput('pack', makePack());
    fixture.detectChanges();

    let emitted = 0;
    fixture.componentInstance.refresh.subscribe(() => {
      emitted += 1;
    });

    const refresh = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Refresh'));
    refresh!.click();
    expect(emitted).toBe(1);
  });

  it('renders a warning banner naming the broken pack when status is missing (FR-003/FR-009)', () => {
    const fixture = TestBed.createComponent(PackDetailHeader);
    fixture.componentRef.setInput('pack', makePack());
    fixture.componentRef.setInput('parentStatus', { status: 'missing', broken_ref: 'acme' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('[role="alert"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('acme');
    // NFR-003: not color-only — has a textual title in addition to the destructive styling.
    expect(banner?.textContent).toContain('Inherited data is incomplete');
  });

  it('renders a warning banner naming the broken ancestor when status is broken-ancestor', () => {
    const fixture = TestBed.createComponent(PackDetailHeader);
    fixture.componentRef.setInput('pack', makePack());
    fixture.componentRef.setInput('parentStatus', {
      status: 'broken-ancestor',
      broken_ref: 'legacy-pack',
      broken_pack_name: 'Legacy Pack',
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const banner = el.querySelector('[role="alert"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('Legacy Pack');
  });

  it('omits the warning banner when status is resolved or unset', () => {
    const fixture = TestBed.createComponent(PackDetailHeader);
    fixture.componentRef.setInput('pack', makePack());
    fixture.componentRef.setInput('parentStatus', { status: 'resolved' });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();

    fixture.componentRef.setInput('parentStatus', null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
  });
});
