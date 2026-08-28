import * as v from 'valibot';

import { applyConfiguredRule } from '../../preset-catalog/oxlint-config/apply-configured-rule.ts';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.ts';

import { TYPEOF_OBJECT_MODES, type TypeofObjectMode } from './oxlint/no-typeof-object.ts';

const TypeofObjectModeSchema = v.picklist(TYPEOF_OBJECT_MODES);

const BunParseSchema = v.pipe(
  v.looseObject({
    typeofObjectMode: v.optional(v.unknown()),
  }),
  v.transform((raw): BunParseGateConfig | undefined => {
    if (raw.typeofObjectMode === undefined) {
      return undefined;
    }
    const parsed = v.safeParse(TypeofObjectModeSchema, raw.typeofObjectMode);
    if (!parsed.success) {
      return undefined;
    }
    return { typeofObjectMode: parsed.output };
  }),
);

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
  const mode: TypeofObjectMode = bunParse.typeofObjectMode;
  if (mode === 'off') {
    rules['bun-parse/no-typeof-object'] = 'off';
    return;
  }
  applyConfiguredRule(rules, 'bun-parse/no-typeof-object', { mode });
}

export type BunParseGateConfig = {
  typeofObjectMode: TypeofObjectMode;
};
