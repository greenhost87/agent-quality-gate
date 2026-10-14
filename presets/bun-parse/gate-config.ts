import * as v from 'valibot';

import { applyConfiguredRule } from 'agent-quality-gate/shared/oxlint';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';
import type { CheckHint, Diagnostic } from 'agent-quality-gate/shared/verify';

import { TYPEOF_OBJECT_MODES, type TypeofObjectMode } from './oxlint/no-typeof-object.ts';

const HINT_RULE_IDS = new Set([
  'bun-parse/no-handmade-json-types',
  'bun-parse/no-raw-json-parse',
  'bun-parse/no-typeof-object',
  'bun-parse/scripts-boundaries',
]);

export function hintsForDiagnostics(diagnostics: readonly Diagnostic[]): CheckHint[] {
  return diagnostics.some((diagnostic) => HINT_RULE_IDS.has(diagnostic.ruleId ?? ''))
    ? [
        {
          kind: 'document',
          id: 'bun-parse-json',
          body: `# bun-parse-json\n\nUse Valibot runtime schemas and infer TypeScript types from them. Parse JSON as unknown with safeParse; do not hand-roll recursive JSON types or use typeof checks to validate parsed values. Avoid raw JSON.parse and response.json() outside tests.\n`,
        },
      ]
    : [];
}

const TypeofObjectModeSchema = v.picklist(TYPEOF_OBJECT_MODES);
const NonEmptyStringsSchema = v.array(v.pipe(v.string(), v.minLength(1)));

const BunParseSchema = v.object({
  scriptDirectories: v.optional(NonEmptyStringsSchema, []),
  typeofObjectMode: v.optional(TypeofObjectModeSchema),
});

export function parsePresetConfig(raw: object | undefined): BunParseGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(BunParseSchema, raw);
  return parsed.success ? parsed.output : undefined;
}

export function applyConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  config: object,
): void {
  const bunParse = parsePresetConfig(config);
  if (bunParse === undefined) {
    return;
  }
  applyConfiguredRule(rules, 'bun-parse/scripts-boundaries', {
    scriptDirectories: [...bunParse.scriptDirectories],
  });
  const mode = bunParse.typeofObjectMode;
  if (mode === undefined) {
    return;
  }
  if (mode === 'off') {
    rules['bun-parse/no-typeof-object'] = 'off';
    return;
  }
  applyConfiguredRule(rules, 'bun-parse/no-typeof-object', { mode });
}

export type BunParseGateConfig = {
  scriptDirectories: string[];
  typeofObjectMode?: TypeofObjectMode;
};
