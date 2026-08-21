import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

import type {
  ArtifactKind,
  CharterGrid as CharterGridModel,
  CharterGridCard as CharterGridCardModel,
} from '../models';
import { CharterGrid } from './charter-grid';

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

function emptyGrid(): CharterGridModel {
  return {
    directive: [],
    tactic: [],
    procedure: [],
    styleguide: [],
    toolguide: [],
    profile: [],
    mission_step_contract: [],
    template: [],
    glossary: [],
  } as CharterGridModel;
}

function makeGrid(
  overrides: Partial<Record<ArtifactKind, CharterGridCardModel[]>>,
): CharterGridModel {
  return { ...emptyGrid(), ...overrides } as CharterGridModel;
}

async function renderGrid(grid: CharterGridModel) {
  const fixture = TestBed.createComponent(CharterGrid);
  fixture.componentRef.setInput('grid', grid);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('CharterGrid (FR-013/FR-016)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharterGrid],
      providers: [provideRouter([]), provideSpartanHlm()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows only kind sections that have cards when no category filter is active', async () => {
    // Directive and tactic are both members of the "Behavioural" group, so they
    // render as one combined section. Multi-section coverage (>1 heading at once)
    // is exercised separately by the FR-010 test below.
    const grid = makeGrid({
      directive: [makeCard({ artifact_name: 'Directive A' })],
      tactic: [makeCard({ artifact_type: 'tactic', artifact_name: 'Tactic A' })],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const headings = Array.from(el.querySelectorAll('section h2')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Behavioural']);
  });

  it('narrows to only the selected category chips, including an empty selected group', async () => {
    const grid = makeGrid({
      toolguide: [makeCard({ artifact_type: 'toolguide', artifact_name: 'Toolguide A' })],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const behaviouralChip = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Behavioural',
    );
    behaviouralChip!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const headings = Array.from(el.querySelectorAll('section h2')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Behavioural']);
    expect(el.textContent).toContain('No artifacts of this kind.');
  });

  it('filters cards by search term across all visible kinds', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({ artifact_name: 'Alpha Directive' }),
        makeCard({ artifact_name: 'Beta Directive' }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const input = el.querySelector<HTMLInputElement>('#charter-grid-search');
    expect(input).toBeTruthy();
    input!.value = 'alpha';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cardNames = Array.from(el.querySelectorAll('app-charter-grid-card')).map((card) =>
      card.textContent?.trim(),
    );
    expect(cardNames.some((text) => text?.includes('Alpha Directive'))).toBe(true);
    expect(cardNames.some((text) => text?.includes('Beta Directive'))).toBe(false);
  });

  it('"Conflicts only" shows exclusively conflicting cards regardless of category/search', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({ artifact_name: 'Conflicted', conflicting: true }),
        makeCard({ artifact_name: 'Clean' }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const conflictsButton = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Conflicts only',
    );
    conflictsButton!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cardNames = Array.from(el.querySelectorAll('app-charter-grid-card')).map((card) =>
      card.textContent?.trim(),
    );
    expect(cardNames.some((text) => text?.includes('Conflicted'))).toBe(true);
    expect(cardNames.some((text) => text?.includes('Clean'))).toBe(false);
  });

  it('lists distinct packs present in the grid as options, sorted alphabetically, with no "all packs" option', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({ artifact_name: 'Directive A', pack_name: 'Zeta Pack' }),
        makeCard({ artifact_name: 'Directive B', pack_name: 'Alpha Pack' }),
      ],
      tactic: [
        makeCard({ artifact_type: 'tactic', artifact_name: 'Tactic A', pack_name: 'Alpha Pack' }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const select = el.querySelector<HTMLSelectElement>('#charter-grid-pack');
    expect(select).toBeTruthy();
    const optionLabels = Array.from(select!.options).map((o) => o.textContent?.trim());
    expect(optionLabels).toEqual(['Alpha Pack', 'Zeta Pack']);
  });

  it('defaults to the alphabetically first pack, showing only its cards without any interaction', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({ artifact_name: 'From Doctrine', pack_name: 'Doctrine Core' }),
        makeCard({ artifact_name: 'From Other', pack_name: 'Other Pack' }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector<HTMLSelectElement>('#charter-grid-pack')!.value).toBe('Doctrine Core');
    const cardNames = Array.from(el.querySelectorAll('app-charter-grid-card')).map((card) =>
      card.textContent?.trim(),
    );
    expect(cardNames.some((text) => text?.includes('From Doctrine'))).toBe(true);
    expect(cardNames.some((text) => text?.includes('From Other'))).toBe(false);
  });

  it('filters cards by selected pack across all visible kinds', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({ artifact_name: 'From Doctrine', pack_name: 'Doctrine Core' }),
        makeCard({ artifact_name: 'From Other', pack_name: 'Other Pack' }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const select = el.querySelector<HTMLSelectElement>('#charter-grid-pack');
    select!.value = 'Other Pack';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cardNames = Array.from(el.querySelectorAll('app-charter-grid-card')).map((card) =>
      card.textContent?.trim(),
    );
    expect(cardNames.some((text) => text?.includes('From Other'))).toBe(true);
    expect(cardNames.some((text) => text?.includes('From Doctrine'))).toBe(false);
  });

  it('composes the pack filter with category + search + conflicts-only filters as an intersection', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({
          artifact_name: 'Match Conflict',
          pack_name: 'Doctrine Core',
          conflicting: true,
        }),
        makeCard({ artifact_name: 'Match Clean', pack_name: 'Doctrine Core' }),
        makeCard({ artifact_name: 'Match Conflict', pack_name: 'Other Pack', conflicting: true }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const select = el.querySelector<HTMLSelectElement>('#charter-grid-pack');
    select!.value = 'Doctrine Core';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const conflictsButton = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Conflicts only',
    );
    conflictsButton!.click();
    fixture.detectChanges();

    const input = el.querySelector<HTMLInputElement>('#charter-grid-search');
    input!.value = 'Match';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const cardNames = Array.from(el.querySelectorAll('app-charter-grid-card')).map((card) =>
      card.textContent?.trim(),
    );
    expect(cardNames).toHaveLength(1);
    expect(cardNames[0]).toContain('Match Conflict');
  });

  it('"Reset filters" resets the selected pack back to the alphabetically first pack', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({ artifact_name: 'Alpha', pack_name: 'Doctrine Core' }),
        makeCard({ artifact_name: 'Beta', pack_name: 'Other Pack' }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const select = el.querySelector<HTMLSelectElement>('#charter-grid-pack');
    select!.value = 'Other Pack';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Alpha');

    const input = el.querySelector<HTMLInputElement>('#charter-grid-search');
    input!.value = 'nonexistent';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const resetButton = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Reset filters',
    );
    resetButton!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('Alpha');
    expect(el.textContent).not.toContain('Beta');
    expect(el.querySelector<HTMLSelectElement>('#charter-grid-pack')!.value).toBe('Doctrine Core');
  });

  it('composes category + search + conflicts-only filters as an intersection', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({ artifact_name: 'Match Conflict', conflicting: true }),
        makeCard({ artifact_name: 'Match Clean' }),
      ],
      tactic: [
        makeCard({ artifact_type: 'tactic', artifact_name: 'Match Conflict', conflicting: true }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    // Category: only Behavioural (covers both directive and tactic member types).
    const behaviouralChip = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Behavioural',
    );
    behaviouralChip!.click();
    fixture.detectChanges();

    // Conflicts only.
    const conflictsButton = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Conflicts only',
    );
    conflictsButton!.click();
    fixture.detectChanges();

    // Search: "Match".
    const input = el.querySelector<HTMLInputElement>('#charter-grid-search');
    input!.value = 'Match';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const headings = Array.from(el.querySelectorAll('section h2')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Behavioural']);

    // Both the directive and tactic "Match Conflict" cards are members of the
    // Behavioural group, so selecting it returns the union of both.
    const cardNames = Array.from(el.querySelectorAll('app-charter-grid-card')).map((card) =>
      card.textContent?.trim(),
    );
    expect(cardNames).toHaveLength(2);
    expect(cardNames.every((name) => name?.includes('Match Conflict'))).toBe(true);
  });

  it('shows a "no artifacts match your filters" state with a reset action when everything is filtered out', async () => {
    const grid = makeGrid({
      directive: [makeCard({ artifact_name: 'Alpha' })],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const input = el.querySelector<HTMLInputElement>('#charter-grid-search');
    input!.value = 'nonexistent';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('No artifacts match your filters');
    const resetButton = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Reset filters',
    );
    expect(resetButton).toBeTruthy();

    resetButton!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('Alpha');
  });

  it('marks only the card whose pack_artifact_id matches busyAddId as busy', async () => {
    const busyCard = makeCard({ artifact_name: 'Busy Card', pack_artifact_id: 'pa-busy' });
    const idleCard = makeCard({ artifact_name: 'Idle Card', pack_artifact_id: 'pa-idle' });
    const grid = makeGrid({ directive: [busyCard, idleCard] });
    const fixture = TestBed.createComponent(CharterGrid);
    fixture.componentRef.setInput('grid', grid);
    fixture.componentRef.setInput('busyAddId', 'pa-busy');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cards = Array.from(el.querySelectorAll('app-charter-grid-card'));
    const busyCardEl = cards.find((c) => c.textContent?.includes('Busy Card'));
    const idleCardEl = cards.find((c) => c.textContent?.includes('Idle Card'));

    expect(busyCardEl?.querySelector('button[aria-busy="true"]')).toBeTruthy();
    expect(idleCardEl?.querySelector('button[aria-busy="true"]')).toBeFalsy();
  });

  it('forwards card toggle/add/resolveConflict events through its own outputs', async () => {
    const card = makeCard({ in_charter: false, artifact_name: 'Alpha' });
    const grid = makeGrid({ directive: [card] });
    const fixture = await renderGrid(grid);
    const added: unknown[] = [];
    fixture.componentInstance.add.subscribe((value) => added.push(value));

    const el = fixture.nativeElement as HTMLElement;
    const addButton = Array.from(el.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Add to Charter'),
    );
    addButton!.click();

    expect(added).toEqual([card]);
  });

  it('forwards a card remove event through its own remove output', async () => {
    const card = makeCard({
      in_charter: true,
      enabled: true,
      charter_item_id: 'item-1',
      artifact_name: 'Alpha',
    });
    const grid = makeGrid({ directive: [card] });
    const fixture = await renderGrid(grid);
    const removed: unknown[] = [];
    fixture.componentInstance.remove.subscribe((value) => removed.push(value));

    const el = fixture.nativeElement as HTMLElement;
    const removeButton = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Alpha from charter"]',
    );
    removeButton!.click();

    expect(removed).toEqual([card]);
  });

  it('marks only the card whose charter_item_id matches busyRemoveId as removing', async () => {
    const busyCard = makeCard({
      in_charter: true,
      artifact_name: 'Busy Card',
      charter_item_id: 'item-busy',
    });
    const idleCard = makeCard({
      in_charter: true,
      artifact_name: 'Idle Card',
      charter_item_id: 'item-idle',
    });
    const grid = makeGrid({ directive: [busyCard, idleCard] });
    const fixture = TestBed.createComponent(CharterGrid);
    fixture.componentRef.setInput('grid', grid);
    fixture.componentRef.setInput('busyRemoveId', 'item-busy');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const cards = Array.from(el.querySelectorAll('app-charter-grid-card'));
    const busyCardEl = cards.find((c) => c.textContent?.includes('Busy Card'));
    const idleCardEl = cards.find((c) => c.textContent?.includes('Idle Card'));

    expect(busyCardEl?.querySelector('button[aria-busy="true"]')).toBeTruthy();
    expect(idleCardEl?.querySelector('button[aria-busy="true"]')).toBeFalsy();
  });

  it("regression: packOptions() still scans every raw kind, not just the selected group's member types", async () => {
    const grid = makeGrid({
      directive: [makeCard({ artifact_name: 'Directive A', pack_name: 'Pack A' })],
      tactic: [
        makeCard({ artifact_type: 'tactic', artifact_name: 'Tactic B', pack_name: 'Pack B' }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const select = el.querySelector<HTMLSelectElement>('#charter-grid-pack');
    const optionsBefore = Array.from(select!.options).map((o) => o.textContent?.trim());
    expect(optionsBefore).toEqual(['Pack A', 'Pack B']);

    const behaviouralChip = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Behavioural',
    );
    behaviouralChip!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const optionsAfter = Array.from(select!.options).map((o) => o.textContent?.trim());
    expect(optionsAfter).toEqual(['Pack A', 'Pack B']);
  });

  it('FR-009: selecting "Behavioural" combines directive/tactic/procedure/styleguide cards matching the active pack filter', async () => {
    const grid = makeGrid({
      directive: [makeCard({ artifact_name: 'Directive Match', pack_name: 'Doctrine Core' })],
      tactic: [
        makeCard({
          artifact_type: 'tactic',
          artifact_name: 'Tactic Match',
          pack_name: 'Doctrine Core',
        }),
      ],
      procedure: [
        makeCard({
          artifact_type: 'procedure',
          artifact_name: 'Procedure Other',
          pack_name: 'Other Pack',
        }),
      ],
      styleguide: [
        makeCard({
          artifact_type: 'styleguide',
          artifact_name: 'Styleguide Match',
          pack_name: 'Doctrine Core',
        }),
      ],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const select = el.querySelector<HTMLSelectElement>('#charter-grid-pack');
    select!.value = 'Doctrine Core';
    select!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const behaviouralChip = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Behavioural',
    );
    behaviouralChip!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const headings = Array.from(el.querySelectorAll('section h2')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Behavioural']);

    const cardNames = Array.from(el.querySelectorAll('app-charter-grid-card')).map((card) =>
      card.textContent?.trim(),
    );
    expect(cardNames).toHaveLength(3);
    expect(cardNames.some((name) => name?.includes('Directive Match'))).toBe(true);
    expect(cardNames.some((name) => name?.includes('Tactic Match'))).toBe(true);
    expect(cardNames.some((name) => name?.includes('Styleguide Match'))).toBe(true);
    expect(cardNames.some((name) => name?.includes('Procedure Other'))).toBe(false);
  });

  it('FR-010: with "All" selected, a combined "Behavioural" section renders alongside separate ungrouped sections', async () => {
    const grid = makeGrid({
      directive: [makeCard({ artifact_name: 'Directive A' })],
      toolguide: [makeCard({ artifact_type: 'toolguide', artifact_name: 'Toolguide A' })],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const headings = Array.from(el.querySelectorAll('section h2')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Behavioural', 'Toolguides']);

    const behaviouralSection = Array.from(el.querySelectorAll('section')).find(
      (s) => s.querySelector('h2')?.textContent?.trim() === 'Behavioural',
    );
    expect(behaviouralSection?.textContent).toContain('Directive A');
  });

  it('FR-011: an explicitly-selected "Behavioural" section with zero matching cards still renders (does not disappear)', async () => {
    const grid = makeGrid({
      directive: [makeCard({ artifact_name: 'Directive A' })],
      tactic: [makeCard({ artifact_type: 'tactic', artifact_name: 'Tactic A' })],
      procedure: [makeCard({ artifact_type: 'procedure', artifact_name: 'Procedure A' })],
      styleguide: [makeCard({ artifact_type: 'styleguide', artifact_name: 'Styleguide A' })],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const behaviouralChip = Array.from(el.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Behavioural',
    );
    behaviouralChip!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = el.querySelector<HTMLInputElement>('#charter-grid-search');
    input!.value = 'nonexistent-term';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const headings = Array.from(el.querySelectorAll('section h2')).map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Behavioural']);
    expect(el.textContent).toContain('No artifacts of this kind.');
  });

  it('groups the combined Behavioural section by original type, each with its own sub-heading', async () => {
    const grid = makeGrid({
      directive: [makeCard({ artifact_name: 'A Directive' })],
      tactic: [makeCard({ artifact_type: 'tactic', artifact_name: 'A Tactic' })],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const behaviouralHeading = Array.from(el.querySelectorAll('section h2')).find(
      (h) => h.textContent?.trim() === 'Behavioural',
    );
    const section = behaviouralHeading!.closest('section')!;
    const subHeadings = Array.from(section.querySelectorAll('h3')).map((h) =>
      h.textContent?.trim(),
    );
    expect(subHeadings).toEqual(['Directives', 'Tactics']);
  });

  it('sorts cards alphabetically by name within each type subgroup of the Behavioural section', async () => {
    const grid = makeGrid({
      directive: [
        makeCard({ artifact_name: 'Zebra Directive' }),
        makeCard({ artifact_name: 'Alpha Directive' }),
      ],
      tactic: [makeCard({ artifact_type: 'tactic', artifact_name: 'Middle Tactic' })],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const behaviouralHeading = Array.from(el.querySelectorAll('section h2')).find(
      (h) => h.textContent?.trim() === 'Behavioural',
    );
    const section = behaviouralHeading!.closest('section')!;
    const cardNames = Array.from(section.querySelectorAll('app-charter-grid-card')).map((card) =>
      card.textContent?.trim(),
    );
    expect(cardNames[0]).toContain('Alpha Directive');
    expect(cardNames[1]).toContain('Zebra Directive');
    expect(cardNames[2]).toContain('Middle Tactic');
  });

  it('does not render a redundant type sub-heading for a singleton-type section', async () => {
    const grid = makeGrid({
      toolguide: [makeCard({ artifact_type: 'toolguide', artifact_name: 'A Toolguide' })],
    });
    const fixture = await renderGrid(grid);
    const el = fixture.nativeElement as HTMLElement;

    const toolguideHeading = Array.from(el.querySelectorAll('section h2')).find(
      (h) => h.textContent?.trim() === 'Toolguides',
    );
    const section = toolguideHeading!.closest('section')!;
    expect(section.querySelectorAll('h3')).toHaveLength(0);
  });
});
