import { describe, expect, it } from 'bun:test';

import {
  applyConfiguredRules,
  parsePresetConfig,
} from 'agent-quality-gate/internal/presets/baseline/gate-config.ts';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';

describe('baseline noNullishExceptUndefined config', () => {
  it('enables the off-by-default rule', () => {
    expect(parsePresetConfig({ noNullishExceptUndefined: true })).toEqual({
      maxInlineParameterObjectMembers: -1,
      noNullishExceptUndefined: true,
    });

    const rules: Record<string, OxlintRuleSetting> = {
      'aqg/no-nullish-except-undefined': 'off',
    };
    applyConfiguredRules(rules, { noNullishExceptUndefined: true });
    expect(rules['aqg/no-nullish-except-undefined']).toBe('error');
  });

  it('leaves the rule off without the flag', () => {
    expect(parsePresetConfig({})).toBeUndefined();

    const rules: Record<string, OxlintRuleSetting> = {
      'aqg/no-nullish-except-undefined': 'off',
    };
    applyConfiguredRules(rules, {});
    expect(rules['aqg/no-nullish-except-undefined']).toBe('off');
  });
});
