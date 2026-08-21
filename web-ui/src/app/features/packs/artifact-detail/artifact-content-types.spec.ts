import { describe, expect, it } from 'vitest';
import {
  DIRECTIVE_CONTENT_FIXTURE,
  DIRECTIVE_CONTENT_FIXTURE_EMPTY,
  PROCEDURE_CONTENT_FIXTURE,
  PROCEDURE_CONTENT_FIXTURE_EMPTY,
  STYLEGUIDE_CONTENT_FIXTURE,
  STYLEGUIDE_CONTENT_FIXTURE_EMPTY,
  TACTIC_CONTENT_FIXTURE,
  TACTIC_CONTENT_FIXTURE_EMPTY,
  TOOLGUIDE_CONTENT_FIXTURE,
  TOOLGUIDE_CONTENT_FIXTURE_EMPTY,
} from './content-fixtures';
import {
  getDirectiveContent,
  getProcedureContent,
  getStyleguideContent,
  getTacticContent,
  getToolguideContent,
  hasAnyDetailsContent,
} from './artifact-content-types';

describe('getDirectiveContent', () => {
  it('maps every field from a fully-populated fixture', () => {
    expect(getDirectiveContent(DIRECTIVE_CONTENT_FIXTURE)).toEqual({
      intent:
        'System designs must maintain clear separation of concerns and well-defined component ' +
        'boundaries so that each part of the system is independently understandable, testable, ' +
        'and replaceable without cascading changes.',
      scope:
        'Applies to all design proposals, implementation plans, and architectural decision ' +
        'records that introduce or modify component boundaries, module interfaces, or ' +
        'cross-cutting concerns.',
      enforcement: 'required',
      instructions: [
        'Define explicit component boundaries before implementation begins; document inputs, ' +
          'outputs, and dependencies for each component.',
        'Record boundary decisions and the rationale for chosen separation in an ADR whenever ' +
          'the design deviates from established patterns.',
      ],
      integrityRules: [
        'Components must not share mutable state across boundaries without an explicit, ' +
          'documented protocol.',
        'Boundary violations discovered during review must be resolved before merge, not ' +
          'deferred to a follow-up task.',
      ],
    });
  });

  it('returns an all-empty view (arrays as [], not undefined) for {}', () => {
    expect(getDirectiveContent(DIRECTIVE_CONTENT_FIXTURE_EMPTY)).toEqual({
      intent: undefined,
      scope: undefined,
      enforcement: undefined,
      instructions: [],
      integrityRules: [],
    });
  });

  it('never throws on null/undefined/unrelated shapes and returns an all-empty view', () => {
    for (const input of [null, undefined, 'a string', 42, { path: '/x', error: 'boom' }]) {
      expect(() => getDirectiveContent(input)).not.toThrow();
      expect(getDirectiveContent(input).instructions).toEqual([]);
    }
  });

  it("maps the YAML 'procedures' key to the 'instructions' field, not 'procedures'", () => {
    const view = getDirectiveContent({ procedures: ['Step one.', 'Step two.'] });
    expect(view.instructions).toEqual(['Step one.', 'Step two.']);
    expect((view as unknown as Record<string, unknown>)['procedures']).toBeUndefined();
  });
});

describe('getTacticContent', () => {
  it('maps every field from a fully-populated fixture', () => {
    expect(getTacticContent(TACTIC_CONTENT_FIXTURE)).toEqual({
      purpose:
        'Enforce short, verifiable coding loops that improve design while keeping behavior safe.',
      steps: [
        {
          title: 'Red',
          description:
            'Write the smallest failing automated test that expresses one behavior increment.',
        },
        {
          title: 'Green',
          description:
            'Implement only the minimum production code needed to satisfy the new failing test.',
        },
        {
          title: 'Maintain fast feedback',
          description: undefined,
        },
      ],
      failureModes: [
        'Rewriting the whole passage instead of removing the specific tic — preserve intent ' +
          'and factual content.',
        'Altering test behavior or assertions during refactor to force a green result instead ' +
          'of reverting and retrying in smaller steps.',
      ],
    });
  });

  it('returns an all-empty view for {}', () => {
    expect(getTacticContent(TACTIC_CONTENT_FIXTURE_EMPTY)).toEqual({
      purpose: undefined,
      steps: [],
      failureModes: [],
    });
  });

  it('defaults a missing step title to an empty string rather than throwing', () => {
    const view = getTacticContent({ steps: [{ description: 'no title here' }] });
    expect(view.steps).toEqual([{ title: '', description: 'no title here' }]);
  });
});

describe('getProcedureContent', () => {
  it('maps every field from a fully-populated fixture', () => {
    expect(getProcedureContent(PROCEDURE_CONTENT_FIXTURE)).toEqual({
      purpose:
        'Resolve software defects by writing a failing test that reproduces the issue before ' +
        'modifying any production code, turning bug fixing into a systematic, verifiable ' +
        'procedure with built-in regression prevention.',
      entryCondition:
        'A bug has been reported or discovered with clear reproduction steps or observable ' +
        'incorrect behavior. The defect can be expressed as a difference between expected and ' +
        'actual behavior in an automated test.',
      exitCondition:
        'A failing test existed that reproduced the bug, production code was changed to make ' +
        'it pass, all other tests still pass, and the test and fix are committed together.',
      steps: [
        {
          title: 'Understand the bug',
          actor: 'agent',
          description:
            'Read the bug report. Identify expected vs actual behavior, reproduction steps, ' +
            'and triggering data or context.',
        },
        {
          title: 'Confirm reproduction with the human-in-charge',
          actor: 'human',
          description:
            'Review the reproduction test and confirm it captures the reported defect before ' +
            'a fix is attempted.',
        },
        {
          title: 'Run the full test suite',
          actor: undefined,
          description: undefined,
        },
      ],
      antiPatterns: [
        {
          name: 'Fix First, Test Later',
          description:
            'Modifying production code before having a failing test. No proof the bug existed ' +
            'or that the fix addresses it.',
        },
        {
          name: 'Full Application Restart',
          description:
            'Deploying the whole application to verify a fix. Slow, noisy, and not isolated.',
        },
      ],
      notes:
        'Stage the test file and the production fix in a single commit. The test documents ' +
        'the bug; the fix resolves it. They are inseparable.',
    });
  });

  it('returns an all-empty view for {}', () => {
    expect(getProcedureContent(PROCEDURE_CONTENT_FIXTURE_EMPTY)).toEqual({
      purpose: undefined,
      entryCondition: undefined,
      exitCondition: undefined,
      steps: [],
      antiPatterns: [],
      notes: undefined,
    });
  });

  it("passes both 'agent' and 'human' actor values through as plain strings", () => {
    const view = getProcedureContent({
      steps: [
        { title: 'A', actor: 'agent' },
        { title: 'B', actor: 'human' },
      ],
    });
    expect(view.steps[0].actor).toBe('agent');
    expect(view.steps[1].actor).toBe('human');
  });

  it('does not throw on an unexpected/missing actor value; surfaces the raw string unchanged', () => {
    // Documented behavior: unrecognized actor strings pass through unchanged
    // (not dropped, not normalized) — the renderer decides how to badge them.
    expect(() => getProcedureContent({ steps: [{ title: 'A', actor: 'robot' }] })).not.toThrow();
    const view = getProcedureContent({ steps: [{ title: 'A', actor: 'robot' }] });
    expect(view.steps[0].actor).toBe('robot');

    const missingActor = getProcedureContent({ steps: [{ title: 'A' }] });
    expect(missingActor.steps[0].actor).toBeUndefined();
  });
});

describe('getStyleguideContent', () => {
  it('maps every field from a fully-populated fixture', () => {
    expect(getStyleguideContent(STYLEGUIDE_CONTENT_FIXTURE)).toEqual({
      scope: 'docs',
      principles: [
        'Single root, 13 sections. All documentation lives under one Common Docs root with a ' +
          'fixed section structure. No second documentation root and no per-version shadow ' +
          'tree.',
        'Frontmatter is the per-page source of truth. In-file YAML frontmatter is the sole ' +
          'authority for per-page metadata.',
      ],
      patterns: [
        {
          name: 'doc_status namespacing',
          description:
            'Use the namespaced doc_status lifecycle key so a documentation lifecycle value ' +
            'can never be confused with the work-package lane status term.',
          goodExample:
            '---\ntitle: Charter Activation\ndoc_status: active\nupdated: 2026-06-27\n---',
          badExample: '---\ntitle: Charter Activation\nstatus: active\n---',
        },
        {
          name: 'related cross-reference',
          description:
            'Express a cross-reference as a related: list of resolvable repo-relative .md ' +
            'paths, validated at build time.',
          goodExample: undefined,
          badExample: undefined,
        },
      ],
      antiPatterns: [
        {
          name: 'Second documentation root',
          description:
            'A second top-level documentation root or a per-version shadow tree re-creates ' +
            'the split-brain the Common Docs root exists to cure.',
          badExample: 'architecture/3.x/...\ndocs/architecture/3x/...',
          goodExample: 'docs/architecture/...\ndocs/adr/3.x/...',
        },
      ],
      qualityTest:
        'A documentation change satisfies this styleguide when the structure ratchet is green ' +
        'for a single 13-section root with no shadow tree, and every related: path resolves.',
      tooling: {
        'structure-single-root-13-section':
          'Anti-sprawl structure ratchet (asserts a single Common Docs root, all sections ' +
          'present, no shadow tree).',
        'related-resolvable-paths':
          'related: path validator (asserts every related: entry resolves to an existing ' +
          'repo-relative .md path).',
      },
    });
  });

  it('returns an all-empty view for {}', () => {
    expect(getStyleguideContent(STYLEGUIDE_CONTENT_FIXTURE_EMPTY)).toEqual({
      scope: undefined,
      principles: [],
      patterns: [],
      antiPatterns: [],
      qualityTest: undefined,
      tooling: {},
    });
  });

  it('surfaces an arbitrary/unexpected tooling key set as a string map', () => {
    const view = getStyleguideContent({
      tooling: { linter: 'eslint', formatter: 'prettier', some_other_key: 'value' },
    });
    expect(view.tooling).toEqual({
      linter: 'eslint',
      formatter: 'prettier',
      some_other_key: 'value',
    });
  });

  it('drops non-string values from tooling rather than throwing', () => {
    const view = getStyleguideContent({
      tooling: { valid: 'ok', numeric: 42, nested: { a: 1 }, arr: ['x'], bool: true },
    });
    expect(view.tooling).toEqual({ valid: 'ok' });
  });
});

describe('getToolguideContent', () => {
  it('maps every field from a fully-populated fixture', () => {
    expect(getToolguideContent(TOOLGUIDE_CONTENT_FIXTURE)).toEqual({
      tool: 'mermaid',
      guidePath: 'src/doctrine/toolguides/built-in/MERMAID_DIAGRAMMING.md',
      summary:
        'Reference guide for using Mermaid as a diagram-as-code tool in Spec Kitty projects. ' +
        'Covers diagram types, syntax patterns, theming via init directives, rendering in ' +
        'Markdown contexts, and project conventions.',
    });
  });

  it('returns an all-empty view for {}', () => {
    expect(getToolguideContent(TOOLGUIDE_CONTENT_FIXTURE_EMPTY)).toEqual({
      tool: undefined,
      guidePath: undefined,
      summary: undefined,
    });
  });
});

describe('hasAnyDetailsContent', () => {
  it('returns true for each of the 5 fully-populated fixtures this WP owns', () => {
    expect(hasAnyDetailsContent('directive', DIRECTIVE_CONTENT_FIXTURE)).toBe(true);
    expect(hasAnyDetailsContent('tactic', TACTIC_CONTENT_FIXTURE)).toBe(true);
    expect(hasAnyDetailsContent('procedure', PROCEDURE_CONTENT_FIXTURE)).toBe(true);
    expect(hasAnyDetailsContent('styleguide', STYLEGUIDE_CONTENT_FIXTURE)).toBe(true);
    expect(hasAnyDetailsContent('toolguide', TOOLGUIDE_CONTENT_FIXTURE)).toBe(true);
  });

  it('returns false for {} content for each of the 5 types this WP owns', () => {
    expect(hasAnyDetailsContent('directive', {})).toBe(false);
    expect(hasAnyDetailsContent('tactic', {})).toBe(false);
    expect(hasAnyDetailsContent('procedure', {})).toBe(false);
    expect(hasAnyDetailsContent('styleguide', {})).toBe(false);
    expect(hasAnyDetailsContent('toolguide', {})).toBe(false);
  });

  it('never throws for the 5 owned types on null/undefined/unrelated shapes', () => {
    for (const type of ['directive', 'tactic', 'procedure', 'styleguide', 'toolguide'] as const) {
      for (const input of [null, undefined, 'x', 42, { path: '/x', error: 'boom' }]) {
        expect(() => hasAnyDetailsContent(type, input)).not.toThrow();
      }
    }
  });

  it('stubs template/glossary as raw-presence checks', () => {
    expect(hasAnyDetailsContent('template', { raw: 'Some markdown text.' })).toBe(true);
    expect(hasAnyDetailsContent('glossary', { raw: 'Some markdown text.' })).toBe(true);
    expect(hasAnyDetailsContent('template', { raw: '' })).toBe(false);
    expect(hasAnyDetailsContent('glossary', {})).toBe(false);
    expect(hasAnyDetailsContent('template', null)).toBe(false);
  });

  it('stubs mission_step_contract as always true (structurally always has steps)', () => {
    expect(hasAnyDetailsContent('mission_step_contract', {})).toBe(true);
    expect(hasAnyDetailsContent('mission_step_contract', null)).toBe(true);
  });
});
