import { describe, expect, it } from 'bun:test';

import {
  applyConfiguredRules,
  parsePresetConfig,
} from 'agent-quality-gate/internal/presets/database/gate-config.ts';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';

describe('database gate config', () => {
  it('configures infrastructure imports for test boundaries', () => {
    const rules: Record<string, OxlintRuleSetting> = {
      'database/test-database-boundaries': { severity: 'error', phase: 'boundaries' },
    };
    const config = { infrastructureImports: ['pg', 'custom-container'] };
    expect(parsePresetConfig(config)).toEqual(config);
    applyConfiguredRules(rules, config);
    expect(rules['database/test-database-boundaries']).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: config,
    });
  });

  it('rejects invalid infrastructure import lists', () => {
    expect(parsePresetConfig({ infrastructureImports: [''] })).toBeUndefined();
  });
});
