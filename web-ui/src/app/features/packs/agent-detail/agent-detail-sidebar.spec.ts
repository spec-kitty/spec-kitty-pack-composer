import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { makeArtifact } from '../detail/test-fixtures';
import { AgentDetailSidebar } from './agent-detail-sidebar';

describe('AgentDetailSidebar (research.md R3)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentDetailSidebar],
      providers: [provideSpartanHlm(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders Profile ID from content["profile-id"] when present', () => {
    const fixture = TestBed.createComponent(AgentDetailSidebar);
    fixture.componentRef.setInput(
      'profile',
      makeArtifact({ artifact_id: 'ART_FALLBACK', content: { 'profile-id': 'agent.profile.v1' } }),
    );
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('agent.profile.v1');
    expect(el.textContent).not.toContain('ART_FALLBACK');
  });

  it('falls back to artifact_id when content["profile-id"] is absent', () => {
    const fixture = TestBed.createComponent(AgentDetailSidebar);
    fixture.componentRef.setInput(
      'profile',
      makeArtifact({ artifact_id: 'ART_FALLBACK', content: {} }),
    );
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ART_FALLBACK');
  });

  it('omits Category/Schema version/Routing priority/Max concurrent tasks rows independently when each is absent', () => {
    const fixture = TestBed.createComponent(AgentDetailSidebar);
    fixture.componentRef.setInput('profile', makeArtifact({ category: undefined, content: {} }));
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Category');
    expect(el.textContent).not.toContain('Schema version');
    expect(el.textContent).not.toContain('Routing priority');
    expect(el.textContent).not.toContain('Max concurrent tasks');
    // Source file is a required field and always renders.
    expect(el.textContent).toContain('Source file');
  });

  it('renders all four rows when all values are present', () => {
    const fixture = TestBed.createComponent(AgentDetailSidebar);
    fixture.componentRef.setInput(
      'profile',
      makeArtifact({
        category: 'governance',
        content: {
          'schema-version': '2.1',
          'routing-priority': 5,
          'max-concurrent-tasks': 3,
        },
      }),
    );
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Category');
    expect(el.textContent).toContain('governance');
    expect(el.textContent).toContain('Schema version');
    expect(el.textContent).toContain('2.1');
    expect(el.textContent).toContain('Routing priority');
    expect(el.textContent).toContain('5');
    expect(el.textContent).toContain('Max concurrent tasks');
    expect(el.textContent).toContain('3');
  });

  it('renders a back-link routing to /packs/:packId and using packName when provided', () => {
    const fixture = TestBed.createComponent(AgentDetailSidebar);
    fixture.componentRef.setInput('profile', makeArtifact());
    fixture.componentRef.setInput('packId', 'pack-42');
    fixture.componentRef.setInput('packName', 'Acme Pack');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector('a');
    expect(link?.textContent).toContain('Acme Pack');
    expect(link?.getAttribute('href')).toBe('/packs/pack-42');
  });
});
