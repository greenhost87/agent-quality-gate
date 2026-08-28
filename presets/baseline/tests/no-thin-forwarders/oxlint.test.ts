import { expect, test } from 'bun:test';

import { runOxlintFixture } from '../support/run-oxlint.ts';

const rule = 'aqg/no-thin-forwarders';
const forbidden = 'Do not wrap calls in thin forwarder';

async function expectRejected(fixture: string) {
  const result = await runOxlintFixture(`no-thin-forwarders/invalid/${fixture}`, 'source.ts', rule);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(forbidden);
}

async function expectAllowed(fixture: string) {
  const result = await runOxlintFixture(`no-thin-forwarders/valid/${fixture}`, 'source.ts', rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('no-thin-forwarders rejects arrow thin forwarders in object properties', async () => {
  await expectRejected('object-property-arrow');
});

test('no-thin-forwarders rejects method thin forwarders in object bags', async () => {
  await expectRejected('object-method');
});

test('no-thin-forwarders rejects nested object-property thin forwarders', async () => {
  await expectRejected('nested-object-property');
});

test('no-thin-forwarders allows object properties with extra logic', async () => {
  await expectAllowed('object-property-with-logic');
});

test('no-thin-forwarders allows direct member calls', async () => {
  await expectAllowed('direct-member-call');
});

test('no-thin-forwarders still allows exported top-level forwarders', async () => {
  await expectAllowed('exported-top-level-forwarder');
});
