import { describe, expect, it } from 'bun:test';

import { applyConfiguredRules, parsePresetConfig } from '../gate-config.ts';

describe('test-colocation gate-config', () => {
  it('parses presetConfig.test-colocation.policy', () => {
    expect(parsePresetConfig({ policy: 'application' })).toEqual({ policy: 'application' });
    expect(parsePresetConfig({ policy: 'aqg-repository' })).toEqual({ policy: 'aqg-repository' });
    expect(parsePresetConfig({ policy: 'invalid' })).toBeUndefined();
    expect(parsePresetConfig({})).toBeUndefined();
  });

  it('applyConfiguredRules is a no-op', () => {
    const rules = { 'baseline/no-class': 'error' as const };
    applyConfiguredRules(rules, { policy: 'application' });
    expect(rules).toEqual({ 'baseline/no-class': 'error' });
  });
});
