import type { OxlintRuleSeverity } from './oxlint-rule-setting.js';

export type OxlintRuleSetting = OxlintRuleSeverity | readonly [OxlintRuleSeverity, object];
