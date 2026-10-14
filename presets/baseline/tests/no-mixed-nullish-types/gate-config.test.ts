import { describe, expect, it } from 'bun:test';

import {
  applyConfiguredRules,
  parsePresetConfig,
} from 'agent-quality-gate/internal/presets/baseline/gate-config.ts';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';

describe('baseline noMixedNullishTypes config', () => {
  it('disables the on-by-default rule', () => {
    expect(parsePresetConfig({ noMixedNullishTypes: false })).toEqual({
      maxInlineParameterObjectMembers: -1,
      noMixedNullishTypes: false,
    });

    const rules: Record<string, OxlintRuleSetting> = {
      'aqg/no-mixed-nullish-types': 'error',
    };
    applyConfiguredRules(rules, { noMixedNullishTypes: false });
    expect(rules['aqg/no-mixed-nullish-types']).toBe('off');
  });

  it('keeps the rule enabled without the flag', () => {
    expect(parsePresetConfig({})).toBeUndefined();

    const rules: Record<string, OxlintRuleSetting> = {
      'aqg/no-mixed-nullish-types': 'error',
    };
    applyConfiguredRules(rules, {});
    expect(rules['aqg/no-mixed-nullish-types']).toBe('error');
  });
});
