import { describe, expect, it } from 'bun:test';

import { oxlintVirtualGroupsFromRules } from '../../execute-verify/oxlint-virtual-groups.js';
import { resolvePresetContract } from '../../../preset-catalog/catalog/preset-catalog.js';
import { applyPresetGateConfig } from '../../../preset-catalog/load-gate-config/load-preset-gate-config.js';
import { oxlintRulePhaseOf } from '../../../preset-catalog/oxlint-config/oxlint-rule-phase.js';
import type { OxlintRuleSetting } from '../../../preset-catalog/oxlint-config/write-oxlint-config.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

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
        directories: ['system/agents', 'app/components/ui'],
        rootExceptions: { 'system/agents': ['agents.types.ts'] },
        forbidConcernPrefix: ['system/agents'],
        maxDepth: { 'app/components/ui': 2 },
        maxFilesPerDirectory: { 'app/components/ui': 12 },
        routeCompositionRoots: {
          'system/agents': {
            manifest: 'app/routes.ts',
            presentationRoot: 'app/components/ui',
          },
        },
      },
    });
    const setting = rules['module-placement/module-placement'];
    expect(setting).toBeDefined();
    if (setting === undefined) {
      return;
    }
    expect(oxlintRulePhaseOf(setting)).toBe('boundaries');
    expect(ruleOptions(setting)).toEqual({
      directories: ['system/agents', 'app/components/ui'],
      rootExceptions: { 'system/agents': ['agents.types.ts'] },
      forbidConcernPrefix: ['system/agents'],
      maxDepth: { 'app/components/ui': 2 },
    });
    const groups = oxlintVirtualGroupsFromRules(rules, contract.overrides);
    expect(groupIdForRule(groups, 'module-placement/module-placement')).toBe(
      'boundaries:module-placement',
    );
  });
});
