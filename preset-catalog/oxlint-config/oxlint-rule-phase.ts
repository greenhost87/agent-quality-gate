import {
  DEFAULT_OXLINT_RULE_PHASE,
  type OxlintRulePhase,
  type OxlintRuleSeverity,
} from './oxlint-rule-setting.js';
import type { OxlintRuleSetting } from './write-oxlint-config.js';

/** Phase an oxlint rule belongs to; rules without a tag default to the lint phase. */
export function oxlintRulePhaseOf(setting: OxlintRuleSetting): OxlintRulePhase {
  if (typeof setting === 'string') {
    return DEFAULT_OXLINT_RULE_PHASE;
  }
  return 'phase' in setting && setting.phase !== undefined
    ? setting.phase
    : DEFAULT_OXLINT_RULE_PHASE;
}

/** Strip manifest-only phase metadata so the value is a plain oxlint config setting. */
export function normalizeOxlintRuleSetting(
  setting: OxlintRuleSetting,
): OxlintRuleSeverity | readonly [OxlintRuleSeverity, object] {
  if (typeof setting === 'string') {
    return setting;
  }
  if (!('severity' in setting)) {
    return setting;
  }
  if (setting.options === undefined) {
    return setting.severity;
  }
  return [setting.severity, setting.options];
}
