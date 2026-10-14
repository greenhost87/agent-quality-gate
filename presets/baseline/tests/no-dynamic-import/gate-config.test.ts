import { describe, expect, it } from 'bun:test';

import {
  applyConfiguredRules,
  parsePresetConfig,
} from 'agent-quality-gate/internal/presets/baseline/gate-config.ts';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';

describe('baseline literalDynamicImportFiles config', () => {
  it('parses project-relative files and applies them to no-dynamic-import', () => {
    expect(
      parsePresetConfig({
        literalDynamicImportFiles: ['instrumentation.ts', 'src/instrumentation.ts'],
      }),
    ).toEqual({
      maxInlineParameterObjectMembers: -1,
      literalDynamicImportFiles: ['instrumentation.ts', 'src/instrumentation.ts'],
    });

    const rules: Record<string, OxlintRuleSetting> = {
      'aqg/no-dynamic-import': 'error',
    };
    applyConfiguredRules(rules, {
      literalDynamicImportFiles: ['src/instrumentation.ts'],
    });
    expect(rules['aqg/no-dynamic-import']).toEqual([
      'error',
      { allowedFiles: ['src/instrumentation.ts'] },
    ]);
  });
});
