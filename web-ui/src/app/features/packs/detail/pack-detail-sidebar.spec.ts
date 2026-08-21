import { TestBed } from '@angular/core/testing';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { PackDetailSidebar } from './pack-detail-sidebar';
import { makePack, makeVersion } from './test-fixtures';

describe('PackDetailSidebar (FR-022 / C-001 / C-003)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackDetailSidebar],
      providers: [provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders Versions and Stats cards and omits Links and People', () => {
    const fixture = TestBed.createComponent(PackDetailSidebar);
    fixture.componentRef.setInput(
      'pack',
      makePack({
        stats: { total: 3, by_type: { directive: 2, profile: 1 } },
      }),
    );
    fixture.componentRef.setInput('versions', [
      makeVersion({ version: '2.0.0', observed_at: '2026-04-01T00:00:00.000Z' }),
      makeVersion({
        id: 'vh-0',
        version: '1.0.0',
        observed_at: '2026-01-01T00:00:00.000Z',
        source: 'refresh',
      }),
    ]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const headings = Array.from(el.querySelectorAll('h2')).map((node) =>
      node.textContent?.trim(),
    );

    expect(headings).toEqual(['Versions', 'Stats']);
    expect(el.textContent).not.toMatch(/People/i);
    expect(el.textContent).toContain('v2.0.0');
    expect(el.textContent).toContain('Directives');
    expect(el.textContent).toContain('Profiles');
    expect(el.textContent).toContain('Total');

    // No remote-import / auth UI on this surface (C-001 / C-003).
    expect(el.querySelector('form, input[type="password"], button[type="submit"]')).toBeNull();
    expect(el.textContent).not.toMatch(/sign in|log in|password|oauth/i);
  });
});
