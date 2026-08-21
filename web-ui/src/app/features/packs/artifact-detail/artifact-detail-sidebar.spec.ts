import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { makeArtifact } from '../detail/test-fixtures';
import { ArtifactDetailSidebar } from './artifact-detail-sidebar';

describe('ArtifactDetailSidebar (FR-020)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtifactDetailSidebar],
      providers: [provideSpartanHlm(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('always renders the artifact id and source file', () => {
    const fixture = TestBed.createComponent(ArtifactDetailSidebar);
    fixture.componentRef.setInput(
      'artifact',
      makeArtifact({ artifact_id: 'ART_001', source_relative_path: 'templates/foo.yaml' }),
    );
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ART_001');
    expect(el.textContent).toContain('Source file');
    expect(el.textContent).toContain('templates/foo.yaml');
  });

  it('renders the category row only when category is present', () => {
    const fixture = TestBed.createComponent(ArtifactDetailSidebar);
    fixture.componentRef.setInput('artifact', makeArtifact({ category: undefined }));
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Category');

    fixture.componentRef.setInput('artifact', makeArtifact({ category: 'governance' }));
    fixture.detectChanges();

    el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Category');
    expect(el.textContent).toContain('governance');
  });

  it('renders a back-link routing to /packs/:packId and using packName when provided', () => {
    const fixture = TestBed.createComponent(ArtifactDetailSidebar);
    fixture.componentRef.setInput('artifact', makeArtifact());
    fixture.componentRef.setInput('packId', 'pack-42');
    fixture.componentRef.setInput('packName', 'Acme Pack');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector('a');
    expect(link?.textContent).toContain('Acme Pack');
    expect(link?.getAttribute('href')).toBe('/packs/pack-42');
  });

  it('falls back to "pack" in the back-link text when packName is not provided', () => {
    const fixture = TestBed.createComponent(ArtifactDetailSidebar);
    fixture.componentRef.setInput('artifact', makeArtifact());
    fixture.componentRef.setInput('packId', 'pack-42');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector('a');
    expect(link?.textContent).toContain('Back to pack');
  });

  it('does not include profile-specific fields such as schema version or routing priority', () => {
    const fixture = TestBed.createComponent(ArtifactDetailSidebar);
    fixture.componentRef.setInput(
      'artifact',
      makeArtifact({
        content: { 'schema-version': '2.1', 'routing-priority': 5, 'max-concurrent-tasks': 3 },
      }),
    );
    fixture.componentRef.setInput('packId', 'pack-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Schema version');
    expect(el.textContent).not.toContain('Routing priority');
    expect(el.textContent).not.toContain('Max concurrent tasks');
  });
});
