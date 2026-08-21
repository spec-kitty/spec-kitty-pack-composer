import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import { AppBreadcrumb, type BreadcrumbItem } from './breadcrumb';

describe('AppBreadcrumb (FR-003 / NFR-002)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppBreadcrumb],
      providers: [provideRouter([]), provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders each item label in order', () => {
    const items: BreadcrumbItem[] = [
      { label: 'Packs', routerLink: ['/packs'] },
      { label: 'My Pack', routerLink: ['/packs', '1'] },
      { label: 'Overview' },
    ];
    const fixture = TestBed.createComponent(AppBreadcrumb);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const labels = Array.from(el.querySelectorAll('li[hlmBreadcrumbItem], li[hlmbreadcrumbitem]')).map(
      (li) => li.textContent?.trim(),
    );
    expect(labels).toEqual(['Packs', 'My Pack', 'Overview']);
  });

  it('renders non-last items with a routerLink as a link with the correct target', () => {
    const items: BreadcrumbItem[] = [
      { label: 'Packs', routerLink: ['/packs'] },
      { label: 'Overview' },
    ];
    const fixture = TestBed.createComponent(AppBreadcrumb);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const link = el.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('Packs');
    expect(link?.getAttribute('href')).toBe('/packs');
  });

  it('renders the last item as non-link text even when it has a routerLink', () => {
    const items: BreadcrumbItem[] = [
      { label: 'Packs', routerLink: ['/packs'] },
      { label: 'Overview', routerLink: ['/packs', 'overview'] },
    ];
    const fixture = TestBed.createComponent(AppBreadcrumb);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll('a')).map((a) => a.textContent?.trim());
    expect(links).not.toContain('Overview');

    const current = el.querySelector('[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Overview');
  });

  it('renders a single-item list as the current page with no separator', () => {
    const items: BreadcrumbItem[] = [{ label: 'Overview' }];
    const fixture = TestBed.createComponent(AppBreadcrumb);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('a').length).toBe(0);
    expect(el.querySelectorAll('li[hlmBreadcrumbSeparator], li[hlmbreadcrumbseparator]').length).toBe(
      0,
    );

    const current = el.querySelector('[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Overview');
  });

  it('sets an accessible nav label and marks the current item for assistive tech', () => {
    const items: BreadcrumbItem[] = [{ label: 'Packs', routerLink: ['/packs'] }, { label: 'Overview' }];
    const fixture = TestBed.createComponent(AppBreadcrumb);
    fixture.componentRef.setInput('items', items);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const nav = el.querySelector('nav');
    expect(nav?.getAttribute('aria-label')).toBe('Breadcrumb');

    const current = el.querySelector('[aria-current="page"]');
    expect(current).toBeTruthy();
    expect(current?.getAttribute('aria-disabled')).toBe('true');
  });
});
