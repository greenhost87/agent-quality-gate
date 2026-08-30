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

test('DAO boundaries reject sql outside DAO implementations', async () => {
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
        'Import sql only from production *.dao.ts database implementations.',
      ),
    ),
  );
});

test('DAO boundaries allow sql only in production DAO implementations', async () => {
  await Promise.all([
    expectAllowed('sql-pool-dao', 'system/database/orders/orders.dao.ts'),
    expectRejected(
      'sql-pool-test-dao',
      'tests/database/orders.dao.ts',
      'Import sql only from production *.dao.ts database implementations.',
    ),
  ]);
});

test('DAO boundaries reject the removed getDatabase accessor', async () => {
  await expectRejected(
    'legacy-get-database-dao',
    'system/database/orders/orders.dao.ts',
    'Import sql instead of the removed getDatabase accessor.',
  );
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

test('DAO boundaries reject migrate satellite files', async () => {
  const message =
    'Keep the migration runner in system/database/migrate.ts; do not create satellite files such as migrate-cli.ts or migrate.types.ts.';
  await Promise.all([
    expectRejected('migrate-types-split', 'system/database/migrate.types.ts', message),
    expectRejected('migrate-cli-split', 'system/database/migrate-cli.ts', message),
  ]);
});

test('DAO boundaries reject database result-helper modules', async () => {
  const message =
    'Do not create database result-helper modules. Inline rows[0] ?? null in the DAO; for mutation not-found checks, use RETURNING and rows.length.';
  await Promise.all([
    expectRejected('dao-result-helper', 'system/database/dao-result.ts', message),
    expectRejected('map-first-row-helper', 'system/database/map-first-row.ts', message),
  ]);
});

test('DAO boundaries reject Bun SQL count metadata and allow canonical inline results', async () => {
  await Promise.all([
    expectRejected(
      'sql-count-metadata',
      'system/database/orders/orders.dao.ts',
      'Do not rely on Bun SQL count metadata. Add RETURNING to the mutation and inspect the returned rows.',
    ),
    expectRejected(
      'renamed-count-helper',
      'system/database/mutation-result.ts',
      'Do not rely on Bun SQL count metadata. Add RETURNING to the mutation and inspect the returned rows.',
    ),
    expectAllowed('inline-dao-results', 'system/database/orders/orders.dao.ts'),
  ]);
});

test('DAO boundaries reject Bun SQL unsafe outside managed database infrastructure', async () => {
  const message =
    'Do not use Bun SQL unsafe outside managed database infrastructure. Use tagged templates and SQL fragments.';
  await Promise.all([
    expectRejected('sql-unsafe-dao', 'system/database/orders/orders.dao.ts', message),
    expectRejected('sql-unsafe-service', 'system/orders/service.ts', message),
    expectAllowed('sql-unsafe-managed-migrate', 'system/database/migrate.ts'),
    expectAllowed('sql-unsafe-managed-test-database', 'tests/setup/testDatabase.bootstrap.ts'),
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
  expect(result.output).toContain('DAO functions must not use default parameter values.');
  await expectRejected(
    'dao-function-default',
    'system/database/orders/orders.dao.ts',
    'DAO functions must not use default parameter values.',
  );
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

test('DAO boundaries require named function exports instead of classes and object bags', async () => {
  await Promise.all([
    expectRejected(
      'dao-class',
      'system/database/orders/orders.dao.ts',
      'Use named DAO functions instead of classes.',
    ),
    expectRejected(
      'dao-object-singleton',
      'system/database/orders/orders.dao.ts',
      'DAO implementation modules may export only named function declarations and types.',
    ),
    expectRejected(
      'dao-object-bag',
      'system/database/orders/orders.dao.ts',
      'DAO implementation modules may export only named function declarations and types.',
    ),
    expectRejected(
      'dao-default-object',
      'system/database/orders/orders.dao.ts',
      'DAO implementation modules may export only named function declarations and types.',
    ),
  ]);
});

test('DAO boundaries reject constructing DAO classes', async () => {
  const constructMessage = 'Do not construct DAO classes; import named DAO functions.';
  await Promise.all([
    expectRejected('new-dao-service', 'system/orders/service.ts', constructMessage),
    expectRejected('new-dao-test', 'tests/orders/service.test.ts', constructMessage),
    expectRejected('extra-dao-construct', 'system/database/orders/orders.dao.ts', constructMessage),
  ]);
});

test('DAO boundaries reject exposing imported DAO operations as runtime values', async () => {
  const message = 'Invoke DAO operations directly; do not expose them as values or re-export them.';
  await Promise.all([
    expectRejected(
      'dao-operation-bag',
      'system/database/database-arrange-observe-surface.ts',
      message,
    ),
    expectRejected('dao-named-operation-value', 'system/orders/service.ts', message),
    expectRejected('dao-runtime-reexport', 'system/orders/service.ts', message),
  ]);
});

test('DAO boundaries reject exported object facades backed by local DAO wrappers', async () => {
  await expectRejected(
    'dao-exported-wrapper-bag',
    'system/orders/service.ts',
    'Do not export object facades backed by DAO operations.',
  );
});

test('DAO boundaries allow direct DAO calls, type re-exports, and local dispatch adapters', async () => {
  await Promise.all([
    expectAllowed('dao-direct-calls', 'system/orders/service.ts'),
    expectAllowed('dao-type-reexport', 'system/orders/service.ts'),
    expectAllowed('dao-local-dispatch-adapter', 'system/orders/service.ts'),
    expectAllowed('dao-test-spy', 'tests/orders/service.test.ts'),
  ]);
});
