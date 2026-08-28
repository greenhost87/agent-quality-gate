import type { OxlintRuleSetting } from './write-oxlint-config.js';

/**
 * Attach presetConfig tuning options onto a manifest rule setting.
 * Preserves phase for object form; replaces options for string and tuple forms.
 */
export function applyConfiguredRule(
  rules: Record<string, OxlintRuleSetting>,
  ruleName: string,
  options: object,
): void {
  const setting = rules[ruleName];
  if (setting === undefined) {
    return;
  }
  if (typeof setting === 'string') {
    rules[ruleName] = [setting, options];
    return;
  }
  // Object form ({ severity, options?, phase? }) keeps its phase tag.
  if ('severity' in setting) {
    rules[ruleName] = {
      severity: setting.severity,
      ...(setting.phase === undefined ? {} : { phase: setting.phase }),
      options,
    };
    return;
  }
  rules[ruleName] = [setting[0], options];
}
