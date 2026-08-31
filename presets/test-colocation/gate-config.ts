import * as v from 'valibot';

import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.ts';
import {
  TEST_COLOCATION_POLICIES,
  type TestColocationGateConfig,
  type TestColocationPolicy,
} from './scan-test-colocation.ts';

export type { TestColocationGateConfig, TestColocationPolicy };

const TestColocationSchema = v.pipe(
  v.looseObject({
    policy: v.optional(v.unknown()),
  }),
  v.transform((raw): TestColocationGateConfig | undefined => {
    for (const policy of TEST_COLOCATION_POLICIES) {
      if (raw.policy === policy) {
        return { policy };
      }
    }
    return undefined;
  }),
);

export function parsePresetConfig(raw: object | undefined): TestColocationGateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = v.safeParse(TestColocationSchema, raw);
  return parsed.success ? parsed.output : undefined;
}

export function applyConfiguredRules(
  _rules: Record<string, OxlintRuleSetting>,
  _config: object,
): void {
  // Boundary check preset; no oxlint rules to configure.
}
