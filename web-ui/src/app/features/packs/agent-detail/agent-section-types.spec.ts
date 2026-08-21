import {
  AGENT_RAW_TAB_ID,
  AGENT_SECTION_TAB_ORDER,
  buildAgentSectionTabs,
  getProfileDescription,
  getProfilePurpose,
  getSpecializationContent,
} from './agent-section-types';

describe('getProfileDescription / getProfilePurpose (FR-007)', () => {
  it('returns the string when description is present', () => {
    expect(getProfileDescription({ description: 'Implements features.' })).toBe(
      'Implements features.',
    );
  });

  it('returns the string when purpose is present', () => {
    expect(getProfilePurpose({ purpose: 'Ship code.' })).toBe('Ship code.');
  });

  it('returns undefined when the key is absent', () => {
    expect(getProfileDescription({})).toBeUndefined();
    expect(getProfilePurpose({})).toBeUndefined();
  });

  it('returns undefined (not empty string) for a blank/whitespace-only string', () => {
    expect(getProfileDescription({ description: '   ' })).toBeUndefined();
    expect(getProfilePurpose({ purpose: '' })).toBeUndefined();
  });

  it('returns undefined when the value at the key is not a string', () => {
    expect(getProfileDescription({ description: 42 })).toBeUndefined();
    expect(getProfilePurpose({ purpose: { nested: true } })).toBeUndefined();
  });
});

describe('buildAgentSectionTabs (FR-008 / FR-011 / FR-012 / FR-013)', () => {
  it('returns only Raw for empty content ({})', () => {
    expect(buildAgentSectionTabs({}).map((t) => t.id)).toEqual([AGENT_RAW_TAB_ID]);
  });

  it('returns only Raw for null content', () => {
    expect(buildAgentSectionTabs(null).map((t) => t.id)).toEqual([AGENT_RAW_TAB_ID]);
  });

  it('returns only Raw for undefined content', () => {
    expect(buildAgentSectionTabs(undefined).map((t) => t.id)).toEqual([AGENT_RAW_TAB_ID]);
  });

  it('shows only Capabilities & Context + Raw when only capabilities data is present', () => {
    const tabs = buildAgentSectionTabs({
      capabilities: ['Write code', 'Fix bugs'],
    });
    expect(tabs.map((t) => t.id)).toEqual(['capabilities', 'raw']);
    expect(tabs[0].label).toBe('Capabilities & Context');
  });

  it('shows Capabilities & Context when only context-sources fields are present', () => {
    const tabs = buildAgentSectionTabs({
      'context-sources': { 'doctrine-layers': ['core'] },
    });
    expect(tabs.map((t) => t.id)).toEqual(['capabilities', 'raw']);
  });

  it('shows only Specialization + Raw when only specialization data is present', () => {
    const tabs = buildAgentSectionTabs({
      specialization: { 'primary-focus': 'Implementation' },
    });
    expect(tabs.map((t) => t.id)).toEqual(['specialization', 'raw']);
    expect(tabs[0].label).toBe('Specialization');
  });

  it('shows only Collaboration + Raw when only collaboration data is present', () => {
    const tabs = buildAgentSectionTabs({
      collaboration: { 'handoff-to': ['reviewer'] },
    });
    expect(tabs.map((t) => t.id)).toEqual(['collaboration', 'raw']);
    expect(tabs[0].label).toBe('Collaboration');
  });

  it('shows only Directives & Tactics + Raw when only directive-references data is present', () => {
    const tabs = buildAgentSectionTabs({
      'directive-references': [{ code: 'DIRECTIVE_001' }],
    });
    expect(tabs.map((t) => t.id)).toEqual(['directives-tactics', 'raw']);
    expect(tabs[0].label).toBe('Directives & Tactics');
  });

  it('shows only Directives & Tactics + Raw when only tactic-references data is present', () => {
    const tabs = buildAgentSectionTabs({
      'tactic-references': [{ id: 'tactic-1' }],
    });
    expect(tabs.map((t) => t.id)).toEqual(['directives-tactics', 'raw']);
  });

  it('shows all 5 tabs, in AGENT_SECTION_TAB_ORDER + Raw order, when all 4 are present', () => {
    const tabs = buildAgentSectionTabs({
      capabilities: ['Write code'],
      specialization: { 'primary-focus': 'Implementation' },
      collaboration: { 'works-with': ['architect'] },
      'directive-references': [{ code: 'DIRECTIVE_001' }],
      'tactic-references': [{ id: 'tactic-1' }],
    });
    expect(tabs.map((t) => t.id)).toEqual([...AGENT_SECTION_TAB_ORDER, AGENT_RAW_TAB_ID]);
  });

  it('merges specialization-context.languages and applies_to_languages, de-duplicated', () => {
    const content = {
      'specialization-context': { languages: ['typescript', 'go'] },
      applies_to_languages: ['go', 'python'],
    };
    const tabs = buildAgentSectionTabs(content);
    expect(tabs.map((t) => t.id)).toEqual(['specialization', 'raw']);

    const { languages } = getSpecializationContent(content);
    expect(languages).toEqual(['typescript', 'go', 'python']);
  });

  it('shows only Raw for parse-error stub content ({ path, error })', () => {
    const stubContent = {
      path: '/packs/acme/profiles/broken.yaml',
      error: 'yaml: line 3: bad indentation',
    };
    expect(buildAgentSectionTabs(stubContent).map((t) => t.id)).toEqual([AGENT_RAW_TAB_ID]);
  });

  it('treats content.capabilities as absent (not a throw) when it is a string instead of an array', () => {
    expect(() => buildAgentSectionTabs({ capabilities: 'not-an-array' })).not.toThrow();
    expect(buildAgentSectionTabs({ capabilities: 'not-an-array' }).map((t) => t.id)).toEqual([
      AGENT_RAW_TAB_ID,
    ]);
  });

  it('treats content["directive-references"] as absent (not a throw) when it is an object instead of an array', () => {
    const content = { 'directive-references': { code: 'DIRECTIVE_001' } };
    expect(() => buildAgentSectionTabs(content)).not.toThrow();
    expect(buildAgentSectionTabs(content).map((t) => t.id)).toEqual([AGENT_RAW_TAB_ID]);
  });

  it('never throws on primitive content (string/number/boolean)', () => {
    expect(() => buildAgentSectionTabs('a string')).not.toThrow();
    expect(() => buildAgentSectionTabs(42)).not.toThrow();
    expect(() => buildAgentSectionTabs(true)).not.toThrow();
    expect(buildAgentSectionTabs('a string').map((t) => t.id)).toEqual([AGENT_RAW_TAB_ID]);
  });
});
