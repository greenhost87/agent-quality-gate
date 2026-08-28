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

const BaselineSchema = v.pipe(
  v.looseObject({
    maxInlineParameterObjectMembers: v.optional(v.unknown()),
    noClassSuffixes: v.optional(v.unknown()),
  }),
  v.transform((raw): BaselineGateConfig | undefined => {
    let maxInlineParameterObjectMembers: number | undefined;
    if (raw.maxInlineParameterObjectMembers !== undefined) {
      const parsed = v.safeParse(
        MaxInlineParameterObjectMembersSchema,
        raw.maxInlineParameterObjectMembers,
      );
      if (parsed.success) {
        maxInlineParameterObjectMembers = parsed.output;
      }
    }
    let noClassSuffixes: string[] | undefined;
    const suffixesArray = v.safeParse(v.array(v.unknown()), raw.noClassSuffixes);
    if (suffixesArray.success) {
      if (suffixesArray.output.length === 0) {
        noClassSuffixes = [];
      } else {
        const parsed = v.safeParse(NonEmptyStringArraySchema, suffixesArray.output);
        if (parsed.success && parsed.output.length > 0) {
          noClassSuffixes = parsed.output;
        }
      }
    }
    if (maxInlineParameterObjectMembers === undefined && noClassSuffixes === undefined) {
      return undefined;
    }
    return {
      maxInlineParameterObjectMembers: maxInlineParameterObjectMembers ?? -1,
      ...(noClassSuffixes === undefined ? {} : { noClassSuffixes }),
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
  if (baseline.noClassSuffixes !== undefined) {
    applyConfiguredRule(rules, 'aqg/no-class', {
      suffixes: [...baseline.noClassSuffixes],
    });
  }
}

export type BaselineGateConfig = {
  maxInlineParameterObjectMembers: number;
  noClassSuffixes?: string[];
};
