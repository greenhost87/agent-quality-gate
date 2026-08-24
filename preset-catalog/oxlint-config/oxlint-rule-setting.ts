export const OXLINT_RULE_SEVERITIES = ['error', 'warn', 'off'] as const;

export type OxlintRuleSeverity = (typeof OXLINT_RULE_SEVERITIES)[number];
