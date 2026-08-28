import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { oxlintVirtualGroupsFromRules } from '../../execute-verify/oxlint-virtual-groups.js';
import { resolvePresetContract } from '../../../preset-catalog/catalog/preset-catalog.js';
import { applyPresetGateConfig } from '../../../preset-catalog/load-gate-config/load-preset-gate-config.js';
import { oxlintRulePhaseOf } from '../../../preset-catalog/oxlint-config/oxlint-rule-phase.js';
import type { OxlintRuleSetting } from '../../../preset-catalog/oxlint-config/write-oxlint-config.js';
import { installPresetFromSource } from '../../../scripts/install-preset/install-preset.js';
import { EXECUTE_VERIFY_REPO_ROOT } from '../../../tests/support/execute-verify-fixture.js';
import { ensureGateInstallNodeModules } from '../../../tests/support/gate-install.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const AQG_PRESETS_PACKAGES = join(EXECUTE_VERIFY_REPO_ROOT, '../aqg-presets/packages');

const PHASE_PRESETS = [
  'bun-parse',
  'config',
  'database',
  'module-placement',
  'playwright',
] as const;

function groupIdForRule(
  groups: ReturnType<typeof oxlintVirtualGroupsFromRules>,
  ruleId: string,
): string | undefined {
  for (const group of groups) {
    if (group.ruleIds.has(ruleId)) {
      return group.id;
    }
  }
  return undefined;
}

function ruleOptions(setting: OxlintRuleSetting | undefined): object | undefined {
  if (setting === undefined || typeof setting === 'string') {
    return undefined;
  }
  if ('severity' in setting) {
    return setting.options;
  }
  return setting[1];
}

describe('preset phase + gate-config options', () => {
  it('keeps every phase-tagged shipped rule in its virtual group after resolve', async () => {
    for (const presetName of PHASE_PRESETS) {
      const contract = await resolvePresetContract([presetName]);
      const groups = oxlintVirtualGroupsFromRules(contract.rules, contract.overrides);
      for (const [ruleId, setting] of Object.entries(contract.rules)) {
        const phase = oxlintRulePhaseOf(setting);
        if (phase === 'lint') {
          continue;
        }
        const groupId = groupIdForRule(groups, ruleId);
        if (phase === 'boundaries') {
          expect(groupId).toStartWith('boundaries:');
          continue;
        }
        expect(groupId).toBe(phase);
      }
    }
  });

  it('preserves module-placement phase while applying presetConfig options', async () => {
    const contract = await resolvePresetContract(['module-placement']);
    const rules = { ...contract.rules };
    await applyPresetGateConfig(rules, contract.activated, {
      'module-placement': {
        directories: ['system/agents'],
        rootExceptions: { 'system/agents': ['agents.types.ts'] },
      },
    });
    const setting = rules['module-placement/module-placement'];
    expect(setting).toBeDefined();
    if (setting === undefined) {
      return;
    }
    expect(oxlintRulePhaseOf(setting)).toBe('boundaries');
    expect(ruleOptions(setting)).toEqual({
      directories: ['system/agents'],
      rootExceptions: { 'system/agents': ['agents.types.ts'] },
    });
    const groups = oxlintVirtualGroupsFromRules(rules, contract.overrides);
    expect(groupIdForRule(groups, 'module-placement/module-placement')).toBe(
      'boundaries:module-placement',
    );
  });

  it('preserves packages phase and allowedRootModules after presetConfig', async () => {
    if (!existsSync(join(AQG_PRESETS_PACKAGES, 'manifest.json'))) {
      return;
    }
    await ensureGateInstallNodeModules();
    await installPresetFromSource(AQG_PRESETS_PACKAGES);
    const contract = await resolvePresetContract(['packages', 'playwright']);
    const rules = { ...contract.rules };
    await applyPresetGateConfig(rules, contract.activated, {
      packages: {
        allowedRootModules: ['next.config.ts', 'playwright.config.ts'],
        declaredDependencies: { fabrics: ['media'] },
      },
    });
    const setting = rules['packages/package-boundaries'];
    expect(setting).toEqual({
      severity: 'error',
      phase: 'boundaries',
      options: {
        allowedRootModules: ['next.config.ts', 'playwright.config.ts'],
        declaredDependencies: { fabrics: ['media'] },
      },
    });
    if (setting === undefined) {
      return;
    }
    expect(oxlintRulePhaseOf(setting)).toBe('boundaries');
    const groups = oxlintVirtualGroupsFromRules(rules, contract.overrides);
    expect(groupIdForRule(groups, 'packages/package-boundaries')).toBe('boundaries:packages');
    expect(groupIdForRule(groups, 'playwright/config')).toBe('boundaries:playwright');
  });
});
