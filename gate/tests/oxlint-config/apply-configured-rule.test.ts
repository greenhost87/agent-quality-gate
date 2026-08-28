import { describe, expect, it } from 'bun:test';

import { applyConfiguredRule } from '../../../preset-catalog/oxlint-config/apply-configured-rule.js';
import type { OxlintRuleSetting } from '../../../preset-catalog/oxlint-config/write-oxlint-config.js';

describe('applyConfiguredRule', () => {
  it('O1 applies options to string severity as a tuple', () => {
    const rules: Record<string, OxlintRuleSetting> = {
      'example/rule': 'error',
    };
    applyConfiguredRule(rules, 'example/rule', { allowed: ['a.ts'] });
    expect(rules['example/rule']).toEqual(['error', { allowed: ['a.ts'] }]);
  });

  it('O2 keeps phase when applying options to object form', () => {
    const rules: Record<string, OxlintRuleSetting> = {
      'example/rule': { severity: 'error', phase: 'boundaries' },
    };
    applyConfiguredRule(rules, 'example/rule', { allowed: ['a.ts'] });
    expect(rules['example/rule']).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: { allowed: ['a.ts'] },
    });
  });

  it('O3 replaces options on tuple form and keeps severity', () => {
    const rules: Record<string, OxlintRuleSetting> = {
      'example/rule': ['warn', { stale: true }],
    };
    applyConfiguredRule(rules, 'example/rule', { allowed: ['a.ts'] });
    expect(rules['example/rule']).toEqual(['warn', { allowed: ['a.ts'] }]);
  });

  it('no-ops when the rule is missing', () => {
    const rules: Record<string, OxlintRuleSetting> = {};
    applyConfiguredRule(rules, 'example/rule', { allowed: ['a.ts'] });
    expect(rules).toEqual({});
  });
});
