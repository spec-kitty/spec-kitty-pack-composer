/**
 * Shared, realistic `content`-shaped fixtures for the 8 non-profile artifact
 * types, modeled on spec-kitty's own built-in doctrine pack (the pack
 * bootstrapped from the installed spec-kitty CLI — see
 * server/pack/builtin/builtin.go). Reused by this WP's own spec and by every
 * later content-renderer WP's spec (WP04-WP07) — do not invent field names
 * not seen in an actual built-in doctrine sample or in data-model.md.
 *
 * Zero Angular/component imports — pure data.
 */

export const DIRECTIVE_CONTENT_FIXTURE: Record<string, unknown> = {
  schema_version: '1.0',
  id: 'DIRECTIVE_001',
  title: 'Architectural Integrity Standard',
  intent:
    'System designs must maintain clear separation of concerns and well-defined component ' +
    'boundaries so that each part of the system is independently understandable, testable, ' +
    'and replaceable without cascading changes.',
  enforcement: 'required',
  scope:
    'Applies to all design proposals, implementation plans, and architectural decision ' +
    'records that introduce or modify component boundaries, module interfaces, or ' +
    'cross-cutting concerns.',
  procedures: [
    'Define explicit component boundaries before implementation begins; document inputs, ' +
      'outputs, and dependencies for each component.',
    'Record boundary decisions and the rationale for chosen separation in an ADR whenever ' +
      'the design deviates from established patterns.',
  ],
  integrity_rules: [
    'Components must not share mutable state across boundaries without an explicit, ' +
      'documented protocol.',
    'Boundary violations discovered during review must be resolved before merge, not ' +
      'deferred to a follow-up task.',
  ],
};

export const DIRECTIVE_CONTENT_FIXTURE_EMPTY: Record<string, unknown> = {};

export const TACTIC_CONTENT_FIXTURE: Record<string, unknown> = {
  schema_version: '1.0',
  id: 'tdd-red-green-refactor',
  name: 'Test Driven Development (TDD)',
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
    },
  ],
  failure_modes: [
    'Rewriting the whole passage instead of removing the specific tic — preserve intent and ' +
      'factual content.',
    'Altering test behavior or assertions during refactor to force a green result instead of ' +
      'reverting and retrying in smaller steps.',
  ],
};

export const TACTIC_CONTENT_FIXTURE_EMPTY: Record<string, unknown> = {};

export const PROCEDURE_CONTENT_FIXTURE: Record<string, unknown> = {
  schema_version: '1.0',
  id: 'test-first-bug-fixing',
  name: 'Test-First Bug Fixing',
  purpose:
    'Resolve software defects by writing a failing test that reproduces the issue before ' +
    'modifying any production code, turning bug fixing into a systematic, verifiable ' +
    'procedure with built-in regression prevention.',
  entry_condition:
    'A bug has been reported or discovered with clear reproduction steps or observable ' +
    'incorrect behavior. The defect can be expressed as a difference between expected and ' +
    'actual behavior in an automated test.',
  exit_condition:
    'A failing test existed that reproduced the bug, production code was changed to make it ' +
    'pass, all other tests still pass, and the test and fix are committed together.',
  steps: [
    {
      title: 'Understand the bug',
      actor: 'agent',
      description:
        'Read the bug report. Identify expected vs actual behavior, reproduction steps, and ' +
        'triggering data or context.',
    },
    {
      title: 'Confirm reproduction with the human-in-charge',
      actor: 'human',
      description:
        'Review the reproduction test and confirm it captures the reported defect before a ' +
        'fix is attempted.',
    },
    {
      title: 'Run the full test suite',
    },
  ],
  anti_patterns: [
    {
      name: 'Fix First, Test Later',
      description:
        'Modifying production code before having a failing test. No proof the bug existed or ' +
        'that the fix addresses it.',
    },
    {
      name: 'Full Application Restart',
      description: 'Deploying the whole application to verify a fix. Slow, noisy, and not isolated.',
    },
  ],
  notes:
    'Stage the test file and the production fix in a single commit. The test documents the ' +
    'bug; the fix resolves it. They are inseparable.',
};

export const PROCEDURE_CONTENT_FIXTURE_EMPTY: Record<string, unknown> = {};

export const STYLEGUIDE_CONTENT_FIXTURE: Record<string, unknown> = {
  schema_version: '1.0',
  id: 'common-docs',
  title: 'Common Docs Styleguide',
  scope: 'docs',
  principles: [
    'Single root, 13 sections. All documentation lives under one Common Docs root with a ' +
      'fixed section structure. No second documentation root and no per-version shadow tree.',
    'Frontmatter is the per-page source of truth. In-file YAML frontmatter is the sole ' +
      'authority for per-page metadata.',
  ],
  patterns: [
    {
      name: 'doc_status namespacing',
      description:
        'Use the namespaced doc_status lifecycle key so a documentation lifecycle value can ' +
        'never be confused with the work-package lane status term.',
      good_example: '---\ntitle: Charter Activation\ndoc_status: active\nupdated: 2026-06-27\n---',
      bad_example: '---\ntitle: Charter Activation\nstatus: active\n---',
    },
    {
      name: 'related cross-reference',
      description:
        'Express a cross-reference as a related: list of resolvable repo-relative .md paths, ' +
        'validated at build time.',
    },
  ],
  anti_patterns: [
    {
      name: 'Second documentation root',
      description:
        'A second top-level documentation root or a per-version shadow tree re-creates the ' +
        'split-brain the Common Docs root exists to cure.',
      bad_example: 'architecture/3.x/...\ndocs/architecture/3x/...',
      good_example: 'docs/architecture/...\ndocs/adr/3.x/...',
    },
  ],
  quality_test:
    'A documentation change satisfies this styleguide when the structure ratchet is green for ' +
    'a single 13-section root with no shadow tree, and every related: path resolves.',
  tooling: {
    'structure-single-root-13-section':
      'Anti-sprawl structure ratchet (asserts a single Common Docs root, all sections ' +
      'present, no shadow tree).',
    'related-resolvable-paths':
      'related: path validator (asserts every related: entry resolves to an existing ' +
      'repo-relative .md path).',
  },
};

export const STYLEGUIDE_CONTENT_FIXTURE_EMPTY: Record<string, unknown> = {};

export const TOOLGUIDE_CONTENT_FIXTURE: Record<string, unknown> = {
  schema_version: '1.0',
  id: 'mermaid-diagramming',
  tool: 'mermaid',
  title: 'Mermaid Diagramming',
  guide_path: 'src/doctrine/toolguides/built-in/MERMAID_DIAGRAMMING.md',
  summary:
    'Reference guide for using Mermaid as a diagram-as-code tool in Spec Kitty projects. ' +
    'Covers diagram types, syntax patterns, theming via init directives, rendering in ' +
    'Markdown contexts, and project conventions.',
  last_updated: '2026-02-27',
};

export const TOOLGUIDE_CONTENT_FIXTURE_EMPTY: Record<string, unknown> = {};

export const MISSION_STEP_CONTRACT_CONTENT_FIXTURE: Record<string, unknown> = {
  schema_version: '1.0',
  id: 'specify',
  action: 'specify',
  mission: 'software-dev',
  steps: [
    {
      id: 'bootstrap',
      description: 'Load charter context for this action',
      command: 'spec-kitty charter context --action specify --role specify --json',
      inputs: [
        { flag: '--profile', source: 'wp.agent_profile', optional: true },
        { flag: '--tool', source: 'env.agent_tool', optional: true },
      ],
    },
    {
      id: 'select_model',
      description:
        'Select the appropriate LLM model tier for specification elicitation and acceptance ' +
        'criteria authoring before any domain reasoning begins.',
      delegates_to: {
        kind: 'directive',
        candidates: ['042-model-discipline'],
      },
      guidance:
        'Specification involves domain elicitation and ambiguity resolution — typically ' +
        'premium-tier work. Confirm the tier before proceeding.',
    },
    {
      id: 'write_spec',
      description: 'Write spec.md to kitty-specs/{feature}/',
      command: 'Write spec.md in kitty-specs/{mission_slug}/',
    },
  ],
};

export const MARKDOWN_RAW_FIXTURE = `# Spec Kitty Glossary - Built-in layer

**Version:** 1.0.0
**Status:** stable

## About this glossary

This directory holds the built-in slice of the doctrine glossary shipped with the spec-kitty
CLI. Terms are taxonomised into coherent domains spanning the full agent-framework stack.

- Architecture & Domain-Driven Design
- Development Practices
- Doctrine & Governance
- Tooling & Infrastructure

\`\`\`mermaid
graph LR
    DocGov["Doctrine & Governance"]
    AgentFW["Agent Framework"]
    DocGov --> AgentFW
\`\`\`

New terminology is marked \`status: candidate\` pending review before promotion to stable.
`;
