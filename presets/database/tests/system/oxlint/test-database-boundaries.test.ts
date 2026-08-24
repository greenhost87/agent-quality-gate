import { expect, test } from 'bun:test';
import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'database/test-database-boundaries';

async function expectRejected(fixture: string, entry: string, ...messages: string[]) {
  const result = await runOxlintFixture(`test-database-boundaries/invalid/${fixture}`, entry, rule);
  expect(result.status).not.toBe(0);
  for (const message of messages) {
    expect(result.output).toContain(message);
  }
}

async function expectAllowed(fixture: string, entry: string) {
  const result = await runOxlintFixture(`test-database-boundaries/valid/${fixture}`, entry, rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('test database boundaries allow infrastructure imports only in the exact managed setup', async () => {
  await Promise.all([
    expectAllowed('managed-setup', 'tests/setup/testDatabase.ts'),
    ...(
      [
        ['infrastructure-other-harness', 'tests/setup/otherHarness.ts'],
        ['infrastructure-package-setup', 'packages/orders/tests/setup/testDatabase.ts'],
      ] as const
    ).map(async ([fixture, entry]) =>
      expectRejected(
        fixture,
        entry,
        'Test database infrastructure is available only from tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
      ),
    ),
  ]);
});

test('test database boundaries derive test paths from the project root', async () => {
  await expectAllowed('project-root-paths', 'system/database/connection.ts');
});

test('test database boundaries allow unrelated lifecycle-shaped imports', async () => {
  await expectAllowed('unrelated-lifecycle', 'tests/helpers/workflow.ts');
});

test('test database boundaries reject test infrastructure imports and containers outside the managed setup', async () => {
  await expectRejected(
    'infrastructure-integration',
    'tests/integration/database.test.ts',
    'Test database infrastructure is available only from tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
    'Only tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts may create a PostgreSQL container.',
  );
});

test('test database boundaries allow only useIsolatedTestDatabase as the managed export and import', async () => {
  const exportResult = await runOxlintFixture(
    'test-database-boundaries/invalid/invalid-exports',
    'tests/setup/testDatabase.ts',
    rule,
  );
  expect(exportResult.status).not.toBe(0);
  expect(exportResult.output).toContain('testDatabase.ts may export only useIsolatedTestDatabase.');
  expect(exportResult.output).toContain('Generic test database query interfaces are not allowed.');

  await Promise.all([
    expectAllowed('valid-export', 'tests/setup/testDatabase.ts'),
    expectRejected(
      'invalid-import',
      'tests/integration/database.test.ts',
      'Import only useIsolatedTestDatabase from tests/setup/testDatabase.ts.',
    ),
    expectAllowed('valid-import', 'tests/integration/database.test.ts'),
  ]);
});

test('test database boundaries reject unit-test setup imports and generic helpers without rejecting DML literals', async () => {
  const result = await runOxlintFixture(
    'test-database-boundaries/invalid/unit-test-setup',
    'tests/unit/users.test.ts',
    rule,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain('Unit tests must not import tests/setup/testDatabase.ts.');
  expect(result.output).toContain('Generic test database query interfaces are not allowed.');
  expect(result.output).not.toContain('SQL DML is not allowed');
});

test('test database boundaries allow DML-looking literals in e2e files', async () => {
  await Promise.all(
    ['e2e-select', 'e2e-insert', 'e2e-update', 'e2e-delete', 'e2e-truncate'].map(async (fixture) =>
      expectAllowed(fixture, 'e2e/users.test.ts'),
    ),
  );
});

test('test database boundaries reject production DAO bindings in beforeAll when the managed hook is used', async () => {
  const beforeAllMessage =
    'Do not use production DAO bindings from beforeAll when useIsolatedTestDatabase is active; arrange in beforeEach or the test body.';

  await Promise.all([
    ...(
      [
        'before-all-named',
        'before-all-alias',
        'before-all-namespace',
        'before-all-hoisted',
        'before-all-js-extension',
      ] as const
    ).map(async (fixture) =>
      expectRejected(fixture, 'tests/integration/orders.test.ts', beforeAllMessage),
    ),
    expectAllowed('before-all-env', 'tests/integration/orders.test.ts'),
  ]);
});

test('test database boundaries reject concurrent Bun tests only in managed database test files', async () => {
  const concurrentMessage =
    'Concurrent Bun tests are not allowed in files that use useIsolatedTestDatabase.';

  await Promise.all([
    ...(['concurrent-aliases', 'concurrent-namespace', 'concurrent-hoisted'] as const).map(
      async (fixture) =>
        expectRejected(fixture, 'tests/integration/orders.test.ts', concurrentMessage),
    ),
    expectAllowed('concurrent-unmanaged', 'tests/unit/pure.test.ts'),
  ]);
});
