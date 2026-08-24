import type {
  BaselineConfig,
  ModulePlacementConfig,
  PackageBoundariesConfig,
} from '../global-config/global-config.js';
import type { ConfiguredRuleEntry, ConfiguredRuleOptions } from './gate-configured-rules.types.js';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.types.js';

function applyConfiguredRule(
  rules: Record<string, OxlintRuleSetting>,
  ruleName: string,
  options: ConfiguredRuleOptions,
): void {
  const severity = rules[ruleName];
  if (typeof severity === 'string') {
    rules[ruleName] = [severity, options];
  }
}

function configuredRuleEntries(
  packageBoundaries: PackageBoundariesConfig | undefined,
  modulePlacement: ModulePlacementConfig | undefined,
  baseline: BaselineConfig | undefined,
): ConfiguredRuleEntry[] {
  const entries: ConfiguredRuleEntry[] = [];
  if (packageBoundaries !== undefined) {
    entries.push({
      ruleName: 'packages/package-boundaries',
      options: {
        allowedRootModules: [...packageBoundaries.allowedRootModules],
        declaredDependencies: Object.fromEntries(
          Object.entries(packageBoundaries.declaredDependencies).map(([owner, dependencies]) => [
            owner,
            [...dependencies],
          ]),
        ),
      },
    });
  }
  if (modulePlacement !== undefined) {
    entries.push({
      ruleName: 'module-placement/module-placement',
      options: {
        directories: [...modulePlacement.directories],
        rootExceptions: Object.fromEntries(
          Object.entries(modulePlacement.rootExceptions).map(([directory, exceptions]) => [
            directory,
            [...exceptions],
          ]),
        ),
      },
    });
  }
  if (baseline !== undefined) {
    entries.push({
      ruleName: 'aqg/max-inline-parameter-object-members',
      options: { max: baseline.maxInlineParameterObjectMembers },
    });
  }
  return entries;
}

export function applyGateConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  packageBoundaries: PackageBoundariesConfig | undefined,
  modulePlacement: ModulePlacementConfig | undefined,
  baseline: BaselineConfig | undefined,
): void {
  for (const entry of configuredRuleEntries(packageBoundaries, modulePlacement, baseline)) {
    if (rules[entry.ruleName] !== undefined) {
      applyConfiguredRule(rules, entry.ruleName, entry.options);
    }
  }
}
