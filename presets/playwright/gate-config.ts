import { isAbsolute } from 'node:path';
import * as v from 'valibot';

import { applyConfiguredRule } from 'agent-quality-gate/shared/oxlint';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';
import type { CheckHint, Diagnostic } from 'agent-quality-gate/shared/verify';

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

function projectRelativeDirectory(value: string): boolean {
  return (
    (value.length === 0 || !isAbsolute(value)) &&
    !value.includes('\\') &&
    (value.length === 0 ||
      value
        .split('/')
        .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'))
  );
}

const ConfigSchema = v.object({
  e2eDirectory: v.optional(v.pipe(v.string(), v.check(projectRelativeDirectory)), ''),
  externalMockOrigins: v.optional(
    v.array(v.pipe(v.string(), v.check(canonicalExternalOrigin))),
    [],
  ),
  processRunnerImports: v.optional(v.array(v.pipe(v.string(), v.minLength(1))), []),
});

const HINT_RULE_IDS = new Set([
  'playwright/e2e-runner',
  'playwright/e2e-black-box',
  'playwright/config',
]);

export function hintsForDiagnostics(diagnostics: readonly Diagnostic[]): CheckHint[] {
  return diagnostics.some((diagnostic) => HINT_RULE_IDS.has(diagnostic.ruleId ?? ''))
    ? [
        {
          kind: 'document',
          id: 'playwright-e2e',
          body: `# playwright-e2e\n\nUse Playwright end-to-end tests for user-visible behavior. Keep tests black-box, configure baseURL and webServer, and mock only canonical external origins.\n`,
        },
      ]
    : [];
}

export function parsePresetConfig(raw: object | undefined): PlaywrightGateConfig | undefined {
  const result = v.safeParse(ConfigSchema, raw);
  return result.success ? result.output : undefined;
}

export function applyConfiguredRules(
  rules: Record<string, OxlintRuleSetting>,
  config: object,
): void {
  const parsed = parsePresetConfig(config);
  if (parsed === undefined) {
    return;
  }
  const options = {
    e2eDirectory: parsed.e2eDirectory,
    externalMockOrigins: [...parsed.externalMockOrigins],
    processRunnerImports: [...parsed.processRunnerImports],
  };
  applyConfiguredRule(rules, 'playwright/e2e-runner', options);
  applyConfiguredRule(rules, 'playwright/e2e-black-box', options);
  applyConfiguredRule(rules, 'playwright/external-network-only', options);
}

export type PlaywrightGateConfig = v.InferOutput<typeof ConfigSchema>;
