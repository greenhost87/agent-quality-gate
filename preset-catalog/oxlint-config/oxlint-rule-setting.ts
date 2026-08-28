export const OXLINT_RULE_SEVERITIES = ['error', 'warn', 'off'] as const;

export type OxlintRuleSeverity = (typeof OXLINT_RULE_SEVERITIES)[number];

/** Verify pipeline classes an oxlint rule can be assigned to; order is owned by the Gate. */
export const OXLINT_RULE_PHASES = ['boundaries', 'contracts', 'ui', 'lint'] as const;

export type OxlintRulePhase = (typeof OXLINT_RULE_PHASES)[number];

/** Rules without an explicit phase tag stay in the semantic lint phase. */
export const DEFAULT_OXLINT_RULE_PHASE: OxlintRulePhase = 'lint';
