import { describe, expect, it } from 'bun:test';

import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';
import {
  applyConfiguredRules,
  parsePresetConfig,
  resolveManagedFileDestination,
} from 'agent-quality-gate/internal/presets/database-sqlite/gate-config.ts';

const CUSTOM_DATABASE_DIRECTORY = 'src/server/database';

describe('database-sqlite preset gate config', () => {
  it('parses a project-relative database directory', () => {
    expect(parsePresetConfig({ databaseDirectory: CUSTOM_DATABASE_DIRECTORY })).toEqual({
      databaseDirectory: CUSTOM_DATABASE_DIRECTORY,
    });
  });

  it('rejects unsafe database directories', () => {
    expect(parsePresetConfig({ databaseDirectory: '/tmp/database' })).toBeUndefined();
    expect(parsePresetConfig({ databaseDirectory: '../database' })).toBeUndefined();
    expect(parsePresetConfig({ databaseDirectory: 'src\\database' })).toBeUndefined();
  });

  it('configures boundaries and relocates production managed files', () => {
    const rules: Record<string, OxlintRuleSetting> = {
      'database-sqlite/boundaries': { severity: 'error', phase: 'boundaries' },
      'database-sqlite/test-boundaries': { severity: 'error', phase: 'boundaries' },
    };
    const config = { databaseDirectory: CUSTOM_DATABASE_DIRECTORY };

    applyConfiguredRules(rules, config);

    expect(rules['database-sqlite/boundaries']).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: config,
    });
    expect(rules['database-sqlite/test-boundaries']).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: config,
    });
    expect(resolveManagedFileDestination('system/database/connection.ts', config)).toBe(
      'src/server/database/connection.ts',
    );
    expect(resolveManagedFileDestination('tests/setup/testDatabase.ts', config)).toBe(
      'tests/setup/testDatabase.ts',
    );
  });
});
