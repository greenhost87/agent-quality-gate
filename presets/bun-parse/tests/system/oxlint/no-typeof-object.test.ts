import { expect, test } from 'bun:test';

import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'bun-parse/no-typeof-object';
const typeofObjectMessage = 'Replace typeof … "object" checks with v.parse(Schema, value).';
const arrayIsArrayMessage = 'Replace Array.isArray(...) checks with v.parse(Schema, value).';
const plainObjectRecipeMessage = 'Replace plain-object guards with v.parse(Schema, value).';

async function expectRejected(
  fixture: string,
  entry: string,
  message: string,
  ruleOptions?: object,
) {
  const result = await runOxlintFixture(
    `no-typeof-object/invalid/${fixture}`,
    entry,
    rule,
    ruleOptions,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
}

async function expectMessageCounts(
  fixture: string,
  expected: ReadonlyMap<string, number>,
  ruleOptions?: object,
) {
  const result = await runOxlintFixture(
    `no-typeof-object/invalid/${fixture}`,
    'utils.ts',
    rule,
    ruleOptions,
  );
  expect(result.status).not.toBe(0);
  for (const [message, count] of expected) {
    expect(result.output.split(message).length - 1).toBe(count);
  }
}

async function expectAllowed(fixture: string, entry: string, ruleOptions?: object) {
  const result = await runOxlintFixture(
    `no-typeof-object/valid/${fixture}`,
    entry,
    rule,
    ruleOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

async function expectAllowedInvalidFixture(fixture: string, entry: string, ruleOptions?: object) {
  const result = await runOxlintFixture(
    `no-typeof-object/invalid/${fixture}`,
    entry,
    rule,
    ruleOptions,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-typeof-object rejects typeof object narrowing', async () => {
  await expectRejected('inline-narrow', 'utils.ts', typeofObjectMessage);
});

test('no-typeof-object rejects Array.isArray narrowing', async () => {
  await expectRejected('array-is-array', 'utils.ts', arrayIsArrayMessage);
});

test('no-typeof-object reports a plain-object recipe once in strict mode', async () => {
  await expectMessageCounts(
    'plain-object-recipe',
    new Map([
      [plainObjectRecipeMessage, 1],
      [typeofObjectMessage, 0],
      [arrayIsArrayMessage, 0],
    ]),
  );
});

test('no-typeof-object reports a reordered recipe within a longer chain once', async () => {
  await expectMessageCounts(
    'long-reordered-recipe',
    new Map([
      [plainObjectRecipeMessage, 1],
      [typeofObjectMessage, 0],
      [arrayIsArrayMessage, 1],
    ]),
  );
});

test('no-typeof-object reports separate recipes for separate identifiers', async () => {
  await expectMessageCounts('two-recipes', new Map([[plainObjectRecipeMessage, 2]]));
});

test('no-typeof-object allows valibot-only modules', async () => {
  await expectAllowed('valibot-only', 'utils.ts');
});

test('no-typeof-object allows typeof object under tests/', async () => {
  await expectAllowed('tests-home', 'tests/fixture.ts');
});

test('no-typeof-object typeof-only mode still rejects typeof object', async () => {
  await expectRejected('inline-narrow', 'utils.ts', typeofObjectMessage, {
    mode: 'typeof-only',
  });
});

test('no-typeof-object typeof-only mode reports a plain-object recipe once', async () => {
  await expectMessageCounts(
    'plain-object-recipe',
    new Map([
      [plainObjectRecipeMessage, 1],
      [typeofObjectMessage, 0],
      [arrayIsArrayMessage, 0],
    ]),
    { mode: 'typeof-only' },
  );
});

test('no-typeof-object typeof-only mode allows Array.isArray alone', async () => {
  await expectAllowedInvalidFixture('array-is-array', 'utils.ts', { mode: 'typeof-only' });
});

test('no-typeof-object off mode allows typeof object, Array.isArray, and recipes', async () => {
  await expectAllowedInvalidFixture('inline-narrow', 'utils.ts', { mode: 'off' });
  await expectAllowedInvalidFixture('array-is-array', 'utils.ts', { mode: 'off' });
  await expectAllowedInvalidFixture('plain-object-recipe', 'utils.ts', { mode: 'off' });
});
