import { expect, test } from 'bun:test';

import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'config/no-trivial-valibot-schema-alias';
const messageFragment = 'Do not export trivial valibot schema alias';

async function expectRejected(fixture: string, aliasName: string) {
  const result = await runOxlintFixture(
    `no-trivial-valibot-schema-alias/invalid/${fixture}`,
    'schema.ts',
    rule,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(messageFragment);
  expect(result.output).toContain(aliasName);
}

async function expectAccepted(fixture: string) {
  const result = await runOxlintFixture(
    `no-trivial-valibot-schema-alias/valid/${fixture}`,
    'schema.ts',
    rule,
  );
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-trivial-valibot-schema-alias rejects exported array(string) aliases', async () => {
  await expectRejected('exported-array-string', 'StringArraySchema');
});

test('no-trivial-valibot-schema-alias rejects exported string aliases', async () => {
  await expectRejected('exported-string', 'NameSchema');
});

test('no-trivial-valibot-schema-alias rejects exported optional(string) aliases', async () => {
  await expectRejected('exported-optional-string', 'OptionalNameSchema');
});

test('no-trivial-valibot-schema-alias allows non-exported local aliases', async () => {
  await expectAccepted('non-exported-alias');
});

test('no-trivial-valibot-schema-alias allows exported domain objects', async () => {
  await expectAccepted('domain-object');
});

test('no-trivial-valibot-schema-alias allows exported pipe with constraints', async () => {
  await expectAccepted('non-empty-pipe');
});

test('no-trivial-valibot-schema-alias allows trivial builders nested in objects', async () => {
  await expectAccepted('inline-in-object');
});
