import { expect, test } from 'bun:test';
import { runOxlintFixture } from './run-oxlint.ts';
import {
  applyConfiguredRules,
  parsePresetConfig,
} from 'agent-quality-gate/internal/presets/playwright/gate-config.ts';
import type { OxlintRuleSetting } from 'agent-quality-gate/shared/oxlint';

const rule = 'playwright/external-network-only';
const options = {
  externalMockOrigins: ['https://payments.example.com', 'wss://payments.example.com'],
};

test('rejects application, ambiguous and detached interception', async () => {
  const result = await runOxlintFixture(
    'external-network/invalid',
    'tests/e2e/orders.pw.ts',
    rule,
    options,
  );
  expect(result.status).toBe(1);
  expect(result.output.match(/error playwright\(external-network-only\)/gu)).toHaveLength(9);
});

test('allows only trusted explicit external origins including HAR and websocket routing', async () => {
  const result = await runOxlintFixture(
    'external-network/valid',
    'tests/e2e/orders.pw.ts',
    rule,
    options,
  );
  expect(result).toEqual({ output: '', status: 0 });
});

test('default policy allows no substitutions', async () => {
  const result = await runOxlintFixture('external-network/valid', 'tests/e2e/orders.pw.ts', rule);
  expect(result.status).toBe(1);
  expect(result.output.match(/error playwright\(external-network-only\)/gu)).toHaveLength(4);
});

test('trusted config maps valid origins and rejects wildcard hosts', () => {
  const rules: Record<string, OxlintRuleSetting> = { [rule]: 'error' };
  applyConfiguredRules(rules, options);
  expect(rules[rule]).toEqual([
    'error',
    {
      e2eDirectory: '',
      externalMockOrigins: options.externalMockOrigins,
      processRunnerImports: [],
    },
  ]);
  expect(parsePresetConfig({ externalMockOrigins: ['https://*.example.com'] })).toBeUndefined();
  expect(
    parsePresetConfig({ externalMockOrigins: ['https://payments.example.com/path'] }),
  ).toBeUndefined();
});
