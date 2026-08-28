import { oxlintRulePhaseOf } from '../../preset-catalog/oxlint-config/oxlint-rule-phase.js';
import {
  DEFAULT_OXLINT_RULE_PHASE,
  OXLINT_RULE_PHASES,
} from '../../preset-catalog/oxlint-config/oxlint-rule-setting.js';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.js';
import type { OxlintGroupOrderOptions, OxlintOutputGroup } from './execute-verify.js';

/** Boundary plugin order inside the boundaries phase; unknown plugins sort after, alphabetically. */
const BOUNDARY_PLUGIN_PRIORITY = ['module-placement', 'config', 'database', 'playwright'] as const;

/** Canonical group order used when config.yaml does not define one; `lint` is always appended last. */
const DEFAULT_GROUP_ORDER = ['boundaries', 'contracts', 'ui'] as const;

const KNOWN_GROUP_ORDER = new Set<string>(OXLINT_RULE_PHASES);

function pluginPriority(plugin: string, priority: readonly string[]): number {
  const index = priority.findIndex((entry) => entry === plugin);
  return index >= 0 ? index : priority.length;
}

function rulePlugin(ruleId: string): string {
  const separator = ruleId.indexOf('/');
  return separator === -1 ? ruleId : ruleId.slice(0, separator);
}

function addRule(rules: Map<string, Set<string>>, key: string, ruleId: string): void {
  let ids = rules.get(key);
  if (ids === undefined) {
    ids = new Set<string>();
    rules.set(key, ids);
  }
  ids.add(ruleId);
}

function collectRulesByPhase(
  rules: Readonly<Record<string, OxlintRuleSetting>>,
  overrides: readonly { rules: Readonly<Record<string, OxlintRuleSetting>> }[],
): { rulesByPhase: Map<string, Set<string>>; boundaryRulesByPlugin: Map<string, Set<string>> } {
  const rulesByPhase = new Map<string, Set<string>>();
  const boundaryRulesByPlugin = new Map<string, Set<string>>();
  const allEntries: Array<[string, OxlintRuleSetting]> = [
    ...Object.entries(rules),
    ...overrides.flatMap((override) => Object.entries(override.rules)),
  ];
  for (const [ruleId, setting] of allEntries) {
    const phase = oxlintRulePhaseOf(setting);
    const target = phase === 'boundaries' ? boundaryRulesByPlugin : rulesByPhase;
    addRule(target, phase === 'boundaries' ? rulePlugin(ruleId) : phase, ruleId);
  }
  return { rulesByPhase, boundaryRulesByPlugin };
}

function normalizedGroupOrder(groupOrder: readonly string[] | undefined): string[] {
  const known = groupOrder?.filter((entry) => KNOWN_GROUP_ORDER.has(entry));
  const result: string[] = [];
  for (const entry of known ?? DEFAULT_GROUP_ORDER) {
    if (!result.includes(entry)) {
      result.push(entry);
    }
  }
  if (!result.includes(DEFAULT_OXLINT_RULE_PHASE)) {
    result.push(DEFAULT_OXLINT_RULE_PHASE);
  }
  return result;
}

function boundaryGroups(
  boundaryRulesByPlugin: Map<string, Set<string>>,
  priority: readonly string[],
): OxlintOutputGroup[] {
  const plugins = [...boundaryRulesByPlugin.keys()].sort((left, right) => {
    const priorityDiff = pluginPriority(left, priority) - pluginPriority(right, priority);
    return priorityDiff !== 0 ? priorityDiff : left.localeCompare(right);
  });
  return plugins.map((plugin) => ({
    id: `boundaries:${plugin}`,
    ruleIds: boundaryRulesByPlugin.get(plugin) ?? new Set<string>(),
  }));
}

function lintCatchAllGroup(
  rulesByPhase: Map<string, Set<string>>,
  additionalLintRuleIds: readonly string[],
): OxlintOutputGroup {
  const ids = new Set<string>(additionalLintRuleIds);
  for (const ruleId of rulesByPhase.get(DEFAULT_OXLINT_RULE_PHASE) ?? []) {
    ids.add(ruleId);
  }
  return { id: DEFAULT_OXLINT_RULE_PHASE, ruleIds: ids };
}

/**
 * Ordered oxlint output groups for the verify phases. Group order and boundary plugin priority
 * come from config.yaml (`lintGroups`, `boundaryPluginPriority`); defaults keep the Gate-owned
 * layout: tagged boundary rules first (sub-prioritized by plugin), then contracts, then ui, then
 * the catch-all semantic lint group. Rules without a tag stay in lint. Includes both top-level
 * rules and override rules so a future `phase:` inside `overrides` is not silently demoted.
 */
export function oxlintVirtualGroupsFromRules(
  rules: Readonly<Record<string, OxlintRuleSetting>>,
  overrides: readonly { rules: Readonly<Record<string, OxlintRuleSetting>> }[] = [],
  additionalLintRuleIds: readonly string[] = [],
  options: OxlintGroupOrderOptions = {},
): OxlintOutputGroup[] {
  const { rulesByPhase, boundaryRulesByPlugin } = collectRulesByPhase(rules, overrides);
  const groups: OxlintOutputGroup[] = [];
  for (const entry of normalizedGroupOrder(options.groupOrder)) {
    if (entry === 'boundaries') {
      groups.push(
        ...boundaryGroups(
          boundaryRulesByPlugin,
          options.boundaryPluginPriority ?? BOUNDARY_PLUGIN_PRIORITY,
        ),
      );
      continue;
    }
    if (entry === DEFAULT_OXLINT_RULE_PHASE) {
      groups.push(lintCatchAllGroup(rulesByPhase, additionalLintRuleIds));
      continue;
    }
    const ids = rulesByPhase.get(entry);
    if (ids !== undefined && ids.size > 0) {
      groups.push({ id: entry, ruleIds: ids });
    }
  }
  return groups;
}
