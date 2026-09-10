import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { readOxlintConfig } from '../../../../config/verify-config-files/verify-config-files.js';
import { runOxlintFixture, runOxlintFixtureRules } from '../support/run-oxlint.ts';

const rule = 'aqg/no-empty-interfaces';
const customMessage = 'Do not declare empty interfaces.';
const emptyObjectType = 'typescript/no-empty-object-type';
const emptyObjectSetting = [
  'error',
  { allowInterfaces: 'always', allowObjectTypes: 'never' },
] as const;

async function expectCustomRejected(fixture: string) {
  const result = await runOxlintFixture(
    `no-empty-interfaces/invalid/${fixture}`,
    'source.ts',
    rule,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(customMessage);
  expect(result.output).toContain('aqg(no-empty-interfaces)');
  expect(result.output).not.toContain('no-empty-object-type');
}

async function expectAllowed(fixture: string) {
  const result = await runOxlintFixture(`no-empty-interfaces/valid/${fixture}`, 'source.ts', rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-empty-interfaces rejects empty interface without extends', async () => {
  await expectCustomRejected('empty-no-extends');
});

test('no-empty-interfaces rejects empty interface with single extends', async () => {
  await expectCustomRejected('empty-single-extends');
});

test('no-empty-interfaces rejects empty interface with multiple extends', async () => {
  await expectCustomRejected('empty-multi-extends');
});

test('no-empty-interfaces allows non-empty interfaces', async () => {
  await expectAllowed('non-empty');
});

test('empty object type literal is owned by no-empty-object-type only', async () => {
  const result = await runOxlintFixtureRules(
    'no-empty-interfaces/invalid/empty-object-type',
    'source.ts',
    {
      [rule]: 'error',
      [emptyObjectType]: [...emptyObjectSetting],
    },
    { plugins: ['typescript'] },
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain('typescript(no-empty-object-type)');
  expect(result.output).not.toContain('aqg(no-empty-interfaces)');
});

test('assets keeps no-empty-object-type interface-always object-never', () => {
  const config = readOxlintConfig(join(import.meta.dir, '../../../../assets'));
  const expected = [...emptyObjectSetting];
  const jsOverride = config.overrides?.find((entry) => {
    const files = (entry as { files?: string[] }).files;
    return files?.includes('**/*.{js,jsx,mjs,cjs}');
  }) as { rules?: Record<string, unknown> } | undefined;
  const tsOverride = config.overrides?.find((entry) => {
    const files = (entry as { files?: string[] }).files;
    return files?.includes('**/*.{ts,tsx,mts,cts}');
  }) as { rules?: Record<string, unknown> } | undefined;
  expect(jsOverride?.rules?.[emptyObjectType]).toEqual(expected);
  expect(tsOverride?.rules?.[emptyObjectType]).toEqual(expected);
});
