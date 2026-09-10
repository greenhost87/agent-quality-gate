import { expect, test } from 'bun:test';
import { join, resolve } from 'node:path';

import { readOxlintConfig } from '../../../../config/verify-config-files/verify-config-files.js';
import { runOxlintFixture } from '../support/run-oxlint.ts';

const rule = 'eslint-js/no-restricted-syntax';
const message = 'Do not use Pick, Omit, Partial, or NonNullable. Write the explicit object shape.';
const selector =
  'TSTypeReference[typeName.name=/^(Pick|Omit|Partial|NonNullable)$/], TSExpressionWithTypeArguments[expression.name=/^(Pick|Omit|Partial|NonNullable)$/], TSInterfaceHeritage[expression.name=/^(Pick|Omit|Partial|NonNullable)$/], TSClassImplements[expression.name=/^(Pick|Omit|Partial|NonNullable)$/]';
const setting = ['error', { selector, message }] as const;
const eslintPlugin = {
  name: 'eslint-js',
  specifier: resolve('node_modules/oxlint-plugin-eslint/index.js'),
};

async function expectRejected(fixture: string) {
  const result = await runOxlintFixture(
    `no-restricted-types/invalid/${fixture}`,
    'source.ts',
    rule,
    [...setting],
    { usePlugin: false, jsPlugins: [eslintPlugin] },
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain('eslint-js(no-restricted-syntax)');
  expect(result.output).toContain(message);
}

async function expectAllowed(fixture: string) {
  const result = await runOxlintFixture(
    `no-restricted-types/valid/${fixture}`,
    'source.ts',
    rule,
    [...setting],
    { usePlugin: false, jsPlugins: [eslintPlugin] },
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('selector rejects unqualified utility types in aliases, extends, and implements', async () => {
  await expectRejected('unqualified-utilities');
});

test('selector rejects shadowed local Pick usage', async () => {
  await expectRejected('shadowed-pick');
});

test('selector allows qualified Namespace.Pick and globalThis.Pick', async () => {
  await expectAllowed('qualified-forms');
});

test('assets TS override owns the complete utility-type selector', () => {
  const config = readOxlintConfig(join(import.meta.dir, '../../../../assets'));
  const tsOverride = config.overrides?.find((entry) => {
    const files = (entry as { files?: string[] }).files;
    return files?.includes('**/*.{ts,tsx,mts,cts}');
  }) as { rules?: Record<string, unknown> } | undefined;
  expect(tsOverride?.rules?.['typescript/no-restricted-types']).toBeUndefined();
  expect(tsOverride?.rules?.[rule]).toContainEqual({ selector, message });
});
