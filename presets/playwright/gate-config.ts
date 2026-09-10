import * as v from 'valibot';

import { applyConfiguredRule } from '../../preset-catalog/oxlint-config/apply-configured-rule.ts';
import type { OxlintRuleSetting } from '../../preset-catalog/oxlint-config/write-oxlint-config.ts';

function canonicalExternalOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) &&
      url.origin === value &&
      url.username === '' &&
      url.password === '' &&
      !/[*?{}]/u.test(value)
    );
  } catch {
    return false;
  }
}

const ConfigSchema = v.object({
  externalMockOrigins: v.array(v.pipe(v.string(), v.check(canonicalExternalOrigin))),
});

export function parsePresetConfig(raw: object | undefined): PlaywrightGateConfig | undefined {
  const result = v.safeParse(ConfigSchema, raw);
  return result.success ? result.output : undefined;
}

export function applyConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  config: object,
): void {
  const parsed = parsePresetConfig(config);
  if (parsed !== undefined) {
    applyConfiguredRule(rules, 'playwright/external-network-only', parsed);
  }
}

export type PlaywrightGateConfig = v.InferOutput<typeof ConfigSchema>;
