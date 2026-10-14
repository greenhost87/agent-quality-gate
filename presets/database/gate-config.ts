import * as v from 'valibot';

import { applyConfiguredRule } from 'agent-quality-gate/shared/oxlint';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';
import type { CheckHint, Diagnostic } from 'agent-quality-gate/shared/verify';

export function hintsForDiagnostics(diagnostics: readonly Diagnostic[]): CheckHint[] {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.ruleId === 'database/dao-boundaries' ||
      diagnostic.ruleId === 'database/test-database-boundaries',
  )
    ? [
        {
          kind: 'document',
          id: 'database-boundary',
          body: `# database-boundary\n\nUse an already production-reachable module for Arrange and observation. Do not create or expand a DAO solely for a test. Keep query-result handling in the DAO and define empty-list semantics before dynamic SQL.\n`,
        },
      ]
    : [];
}

const DatabaseConfigSchema = v.object({
  infrastructureImports: v.optional(v.array(v.pipe(v.string(), v.minLength(1))), []),
});

type DatabaseGateConfig = v.InferOutput<typeof DatabaseConfigSchema>;

export function parsePresetConfig(raw: object | undefined): DatabaseGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(DatabaseConfigSchema, raw);
  return parsed.success ? parsed.output : undefined;
}

export function applyConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  config: object,
): void {
  const parsed = parsePresetConfig(config);
  if (parsed !== undefined) {
    applyConfiguredRule(rules, 'database/test-database-boundaries', {
      infrastructureImports: [...parsed.infrastructureImports],
    });
  }
}
