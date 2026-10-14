import { describe, expect, it } from 'bun:test';

import { oxlintVirtualGroupsFromRules } from '#system/gate/run/oxlint/virtual-groups.ts';
import { resolvePresetContract } from '#system/presets/preset-catalog.ts';
import { applyPresetGateConfig } from '#system/presets/load-preset-gate-config.ts';
import { oxlintRulePhaseOf, type OxlintRuleSetting } from '#system/presets/write-oxlint-config.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';

useIsolatedAgentQualityGateHome();

const PHASE_PRESETS = ['bun-parse', 'config', 'database', 'layout', 'playwright'] as const;

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

  it('preserves layout placement phase while applying presetConfig options', async () => {
    const contract = await resolvePresetContract(['layout']);
    const rules = { ...contract.rules };
    await applyPresetGateConfig(rules, contract.activated, {
      layout: {
        placement: {
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
