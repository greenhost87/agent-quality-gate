import { expect, test } from 'bun:test';
import { runOxlintFixture } from './run-oxlint.ts';

const rule = 'database/dao-boundaries';

async function expectRejected(fixture: string, entry: string, message: string) {
  const result = await runOxlintFixture(`dao-boundaries/invalid/${fixture}`, entry, rule);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
}

async function expectAllowed(fixture: string, entry: string) {
  const result = await runOxlintFixture(`dao-boundaries/valid/${fixture}`, entry, rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

test('DAO boundaries reject database driver imports outside system/database', async () => {
  await expectRejected(
    'pg-import-outside',
    'system/orders/service.ts',
    'Import the database driver only from system/database or tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
  );
});

test('DAO boundaries reject getDatabase outside DAO implementations', async () => {
  await Promise.all(
    (
      [
        ['sql-import-service', 'system/orders/service.ts'],
        ['sql-import-test', 'tests/orders/service.test.ts'],
      ] as const
    ).map(async ([fixture, entry]) =>
      expectRejected(
        fixture,
        entry,
        'Import getDatabase only from production *.dao.ts database implementations.',
      ),
    ),
  );
});

test('DAO boundaries allow getDatabase only in production DAO implementations', async () => {
  await Promise.all([
    expectAllowed('sql-pool-dao', 'system/database/orders/orders.dao.ts'),
    expectRejected(
      'sql-pool-test-dao',
      'tests/database/orders.dao.ts',
      'Import getDatabase only from production *.dao.ts database implementations.',
    ),
  ]);
});

test('DAO boundaries allow database lifecycle imports from connection', async () => {
  await Promise.all([
    expectAllowed('lifecycle-bootstrap', 'system/bootstrap.ts'),
    expectAllowed('lifecycle-test-database', 'tests/setup/testDatabase.ts'),
  ]);
});

test('DAO boundaries reject other connection exports outside system/database', async () => {
  await Promise.all(
    ['default-connection-import', 'namespace-connection-import', 'pool-create-import'].map(
      async (fixture) =>
        expectRejected(
          fixture,
          'tests/database/orders.dao.ts',
          'Import only database lifecycle functions from system/database/connection outside system/database.',
        ),
    ),
  );
});

test('DAO boundaries allow the database driver only in system/database and managed testDatabase', async () => {
  await Promise.all([
    expectAllowed('pg-driver-connection', 'system/database/connection.ts'),
    expectAllowed('pg-driver-test-database', 'tests/setup/testDatabase.ts'),
    ...(
      [
        ['pg-driver-seed', 'tests/setup/seedPendingWorkflow.ts'],
        ['pg-driver-package-test-database', 'packages/orders/tests/setup/testDatabase.ts'],
        ['pg-driver-service-test', 'tests/orders/service.test.ts'],
        ['pg-driver-specs-test', 'specs/orders/service.test.ts'],
        ['pg-driver-src-test', 'src/orders/__tests__/service.ts'],
      ] as const
    ).map(async ([fixture, entry]) =>
      expectRejected(
        fixture,
        entry,
        'Import the database driver only from system/database or tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.',
      ),
    ),
  ]);
});

test('DAO boundaries reject connection files outside system/database', async () => {
  await Promise.all([
    expectRejected(
      'connection-outside-orders',
      'system/orders/connection.ts',
      'Connection files must be inside system/database.',
    ),
    expectRejected(
      'connection-outside-fixtures',
      'tests/fixtures/connection.types.ts',
      'Connection files must be inside system/database.',
    ),
  ]);
});

test('DAO boundaries allow connection files inside system/database', async () => {
  await Promise.all([
    expectAllowed('connection-inside', 'system/database/connection.ts'),
    expectAllowed('connection-types-inside', 'system/database/orders/connection.types.ts'),
  ]);
});

test('DAO boundaries reject test-only DAO implementations without rejecting DAO types or DAO tests', async () => {
  await Promise.all([
    ...(
      [
        ['test-dao-implementation', 'tests/database/orders.dao.ts'],
        ['spec-dao-implementation', 'specs/database/orders.dao.ts'],
        ['src-test-dao-implementation', 'src/orders/__tests__/orders.dao.ts'],
        ['orders-test-dao', 'src/orders/orders.test.dao.ts'],
        ['orders-spec-dao', 'src/orders/orders.spec.dao.ts'],
      ] as const
    ).map(async ([fixture, entry]) =>
      expectRejected(fixture, entry, 'DAO implementation files are not allowed in tests.'),
    ),
    expectAllowed('dao-types-test', 'tests/database/orders.dao.types.ts'),
    expectAllowed('dao-test-test', 'tests/database/orders.dao.test.ts'),
  ]);
});

test('DAO boundaries reject production DAO files outside system/database', async () => {
  await Promise.all([
    expectRejected(
      'dao-outside-system',
      'system/orders/orders.dao.ts',
      'DAO files must be inside system/database/<domain> with exactly one domain directory.',
    ),
    expectRejected(
      'dao-archive-outside',
      'system/orders/orders.dao.archive.ts',
      'DAO files must be inside system/database/<domain> with exactly one domain directory.',
    ),
  ]);
});

test('DAO boundaries reject DAO files outside exactly one domain directory', async () => {
  await Promise.all([
    expectRejected(
      'dao-no-domain',
      'system/database/orders.dao.ts',
      'DAO files must be inside system/database/<domain> with exactly one domain directory.',
    ),
    expectRejected(
      'dao-nested-domain',
      'system/database/orders/archive/orders.dao.types.ts',
      'DAO files must be inside system/database/<domain> with exactly one domain directory.',
    ),
  ]);
});

test('DAO boundaries allow implementations and types inside one domain directory', async () => {
  await Promise.all(
    [
      'system/database/orders/orders.dao.ts',
      'system/database/orders/orders.dao.types.ts',
      'system/database/orders/orders.dao.archive.ts',
    ].map(async (entry) => {
      const fixture = entry.endsWith('.types.ts')
        ? 'dao-types'
        : entry.endsWith('.archive.ts')
          ? 'dao-archive'
          : 'dao-implementation';
      await expectAllowed(fixture, entry);
    }),
  );
});

test('DAO boundaries reject implementation imports by any path and default method parameters', async () => {
  const result = await runOxlintFixture(
    'dao-boundaries/invalid/dao-cross-import',
    'system/database/orders/orders.dao.ts',
    rule,
  );
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(
    'DAO implementation modules must not import other DAO implementation modules.',
  );
  expect(result.output).toContain('DAO methods must not use default parameter values.');
});

test('DAO boundaries reject obvious DDL outside migrations and managed administrative statements', async () => {
  const ddlMessage =
    'Schema DDL is allowed only in migrations/, as managed CREATE TABLE IF NOT EXISTS schema_migrations in system/database/migrate.ts, or as managed CREATE/DROP DATABASE in tests/setup/testDatabase.ts or tests/setup/testDatabase.bootstrap.ts.';
  await Promise.all([
    ...(
      [
        ['ddl-create-table-dao', 'system/database/orders/orders.dao.ts'],
        ['ddl-create-table-migrate', 'system/database/migrate.ts'],
        ['ddl-alter-service', 'system/orders/service.ts'],
        ['ddl-drop-test', 'tests/orders/service.test.ts'],
        ['ddl-function-helper', 'tests/setup/helpers.ts'],
        ['ddl-create-database-package', 'packages/orders/tests/setup/testDatabase.ts'],
      ] as const
    ).map(async ([fixture, entry]) => expectRejected(fixture, entry, ddlMessage)),
    expectAllowed('migration-create', 'migrations/000001-init.ts'),
    expectAllowed('migration-alter', 'migrations/000002-alter.ts'),
    expectAllowed('managed-ddl-migrate', 'system/database/migrate.ts'),
    expectAllowed('managed-ddl-test-database', 'tests/setup/testDatabase.ts'),
  ]);
});

test('DAO boundaries allow plain DML-looking string literals', async () => {
  await Promise.all([
    expectAllowed('dml-dao', 'system/database/orders/orders.dao.ts'),
    expectAllowed('dml-service-test', 'tests/orders/service.test.ts'),
    expectAllowed('dml-e2e', 'e2e/users.test.ts'),
  ]);
});

test('DAO boundaries require an exported singleton for each DAO class', async () => {
  await Promise.all([
    expectAllowed('dao-singleton', 'system/database/orders/orders.dao.ts'),
    expectRejected(
      'missing-dao-singleton',
      'system/database/orders/orders.dao.ts',
      'Export a module singleton const matching the DAO class name in camelCase (OrdersDao → ordersDao).',
    ),
    expectRejected(
      'wrong-dao-singleton-name',
      'system/database/orders/orders.dao.ts',
      'Export a module singleton const matching the DAO class name in camelCase (OrdersDao → ordersDao).',
    ),
  ]);
});

test('DAO boundaries reject constructing DAO classes outside the singleton export', async () => {
  const constructMessage =
    'Construct DAO classes only as the exported module singleton inside their production *.dao.ts file.';
  await Promise.all([
    expectRejected('new-dao-service', 'system/orders/service.ts', constructMessage),
    expectRejected('new-dao-test', 'tests/orders/service.test.ts', constructMessage),
    expectRejected('extra-dao-construct', 'system/database/orders/orders.dao.ts', constructMessage),
  ]);
});
