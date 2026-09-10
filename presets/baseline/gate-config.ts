import * as v from 'valibot';

import { applyConfiguredRule } from '../../preset-catalog/oxlint-config/apply-configured-rule.ts';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.ts';

const StringArraySchema = v.pipe(
  v.array(v.unknown()),
  v.transform((items) => items.filter((item): item is string => typeof item === 'string')),
);

const NonEmptyStringArraySchema = v.pipe(
  StringArraySchema,
  v.transform((items) => items.filter((item) => item.length > 0)),
);

const MaxInlineParameterObjectMembersSchema = v.pipe(
  v.number(),
  v.integer(),
  v.check((value) => value === -1 || value >= 0),
);

function parseMaxInlineParameterObjectMembers(raw: unknown): number | undefined {
  const parsed = v.safeParse(MaxInlineParameterObjectMembersSchema, raw);
  return parsed.success ? parsed.output : undefined;
}

function parseUnknownArray(raw: unknown): unknown[] | undefined {
  const parsed = v.safeParse(v.array(v.unknown()), raw);
  return parsed.success ? parsed.output : undefined;
}

function parseLiteralDynamicImportFiles(raw: unknown): string[] | undefined {
  const items = parseUnknownArray(raw);
  if (items === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(NonEmptyStringArraySchema, items);
  if (!parsed.success || parsed.output.length !== items.length) {
    return undefined;
  }
  return parsed.output;
}

function parseNoClassSuffixes(raw: unknown): string[] | undefined {
  const items = parseUnknownArray(raw);
  if (items === undefined || items.length === 0) {
    return items === undefined ? undefined : [];
  }
  const parsed = v.safeParse(NonEmptyStringArraySchema, items);
  return parsed.success && parsed.output.length > 0 ? parsed.output : undefined;
}

function parseNoNullishExceptUndefined(raw: unknown): true | undefined {
  const parsed = v.safeParse(v.boolean(), raw);
  return parsed.success && parsed.output ? true : undefined;
}

function parseNoMixedNullishTypes(raw: unknown): boolean | undefined {
  const parsed = v.safeParse(v.boolean(), raw);
  return parsed.success ? parsed.output : undefined;
}

const BaselineSchema = v.pipe(
  v.looseObject({
    literalDynamicImportFiles: v.optional(v.unknown()),
    maxInlineParameterObjectMembers: v.optional(v.unknown()),
    noClassSuffixes: v.optional(v.unknown()),
    noMixedNullishTypes: v.optional(v.unknown()),
    noNullishExceptUndefined: v.optional(v.unknown()),
  }),
  v.transform((raw): BaselineGateConfig | undefined => {
    const literalDynamicImportFiles = parseLiteralDynamicImportFiles(raw.literalDynamicImportFiles);
    const maxInlineParameterObjectMembers = parseMaxInlineParameterObjectMembers(
      raw.maxInlineParameterObjectMembers,
    );
    const noClassSuffixes = parseNoClassSuffixes(raw.noClassSuffixes);
    const noNullishExceptUndefined = parseNoNullishExceptUndefined(raw.noNullishExceptUndefined);
    const noMixedNullishTypes = parseNoMixedNullishTypes(raw.noMixedNullishTypes);
    if (
      literalDynamicImportFiles === undefined &&
      maxInlineParameterObjectMembers === undefined &&
      noClassSuffixes === undefined &&
      noMixedNullishTypes === undefined &&
      noNullishExceptUndefined === undefined
    ) {
      return undefined;
    }
    return {
      maxInlineParameterObjectMembers: maxInlineParameterObjectMembers ?? -1,
      ...(literalDynamicImportFiles === undefined ? {} : { literalDynamicImportFiles }),
      ...(noClassSuffixes === undefined ? {} : { noClassSuffixes }),
      ...(noMixedNullishTypes === undefined ? {} : { noMixedNullishTypes }),
      ...(noNullishExceptUndefined === undefined ? {} : { noNullishExceptUndefined }),
    };
  }),
);

export function parsePresetConfig(raw: object | undefined): BaselineGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(BaselineSchema, raw);
  return parsed.success ? parsed.output : undefined;
}

export function applyConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  config: object,
): void {
  const baseline = parsePresetConfig(config);
  if (baseline === undefined) {
    return;
  }
  applyConfiguredRule(rules, 'aqg/max-inline-parameter-object-members', {
    max: baseline.maxInlineParameterObjectMembers,
  });
  if (baseline.noMixedNullishTypes !== undefined) {
    setRuleSeverity(
      rules,
      'aqg/no-mixed-nullish-types',
      baseline.noMixedNullishTypes ? 'error' : 'off',
    );
  }
  if (baseline.noNullishExceptUndefined !== undefined) {
    setRuleSeverity(rules, 'aqg/no-nullish-except-undefined', 'error');
  }
  if (baseline.literalDynamicImportFiles !== undefined) {
    applyConfiguredRule(rules, 'aqg/no-dynamic-import', {
      allowedFiles: [...baseline.literalDynamicImportFiles],
    });
  }
  if (baseline.noClassSuffixes !== undefined) {
    applyConfiguredRule(rules, 'aqg/no-class', {
      suffixes: [...baseline.noClassSuffixes],
    });
  }
}

export type BaselineGateConfig = {
  literalDynamicImportFiles?: string[];
  maxInlineParameterObjectMembers: number;
  noClassSuffixes?: string[];
  noMixedNullishTypes?: boolean;
  noNullishExceptUndefined?: true;
};

function setRuleSeverity(
  rules: Record<string, OxlintRuleSetting>,
  ruleId: string,
  severity: 'error' | 'off',
): void {
  if (!Object.hasOwn(rules, ruleId)) {
    return;
  }
  const setting = rules[ruleId];
  if (typeof setting === 'string') {
    rules[ruleId] = severity;
    return;
  }
  if ('severity' in setting) {
    rules[ruleId] = { ...setting, severity };
    return;
  }
  rules[ruleId] = severity;
}
