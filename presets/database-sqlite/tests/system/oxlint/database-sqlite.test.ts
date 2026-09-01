import { spawn, write } from 'bun';
import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const oxlintPath = resolve('node_modules/.bin/oxlint');
const pluginPath = resolve(import.meta.dir, '../../../oxlint/database-sqlite.ts');

async function runOxlint(
  relativePath: string,
  source: string,
  rule = 'database-sqlite/boundaries',
): Promise<OxlintResult> {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), 'database-sqlite-')));
  const sourcePath = join(workspace, relativePath);
  const configPath = join(workspace, 'oxlint.json');
  await mkdir(dirname(sourcePath), { recursive: true });
  await Promise.all([
    write(sourcePath, source),
    write(
      configPath,
      JSON.stringify({
        categories: { correctness: 'off' },
        jsPlugins: [{ name: 'database-sqlite', specifier: pluginPath }],
        rules: { [rule]: 'error' },
      }),
    ),
  ]);
  try {
    const child = spawn({
      cmd: [oxlintPath, '--format', 'agent', '--config', configPath, sourcePath],
      cwd: workspace,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { output: `${stdout}${stderr}`, status };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function expectAllowed(relativePath: string, source: string): Promise<void> {
  const result = await runOxlint(relativePath, source);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

async function expectAllowedByRule(
  rule: string,
  relativePath: string,
  source: string,
): Promise<void> {
  const result = await runOxlint(relativePath, source, rule);
  expect(result.output).toBe('');
  expect(result.status).toBe(0);
}

async function expectRejected(
  relativePath: string,
  source: string,
  message: string,
): Promise<void> {
  const result = await runOxlint(relativePath, source);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
}

async function expectRejectedByRule(
  rule: string,
  relativePath: string,
  source: string,
  message: string,
): Promise<void> {
  const result = await runOxlint(relativePath, source, rule);
  expect(result.status).not.toBe(0);
  expect(result.output).toContain(message);
}

function sourceLines(...lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

describe('database-sqlite boundaries', () => {
  it('keeps runtime driver imports in database infrastructure', async () => {
    const message = 'Import the bun:sqlite runtime only from managed database infrastructure';
    await Promise.all([
      expectRejected(
        'system/orders/service.ts',
        `import { Database } from 'bun:sqlite';\n`,
        message,
      ),
      expectAllowed('system/orders/service.ts', `import type { Database } from 'bun:sqlite';\n`),
      expectAllowed('system/database/connection.ts', `import { Database } from 'bun:sqlite';\n`),
      expectAllowed('tests/setup/testDatabase.ts', `import { Database } from 'bun:sqlite';\n`),
      expectRejected(
        'system/database/orders/orders.dao.ts',
        `import { Database } from 'bun:sqlite';\n`,
        message,
      ),
    ]);
  });

  it('keeps connection composition outside system services', async () => {
    const source = `import { getDatabase } from '@/system/database/connection';\n`;
    await Promise.all([
      expectRejected(
        'system/orders/service.ts',
        source,
        'Compose the SQLite connection outside system modules',
      ),
      expectAllowed('app/api/orders/route.ts', source),
      expectAllowed('tests/orders/service.test.ts', source),
    ]);
  });

  it('requires one DAO domain directory', async () => {
    const message = 'DAO files must be inside system/database/<domain>';
    await Promise.all([
      expectAllowed('system/database/orders/orders.dao.ts', 'export class OrdersDao {}\n'),
      expectRejected('system/database/orders.dao.ts', 'export class OrdersDao {}\n', message),
      expectRejected('tests/orders.dao.ts', 'export class OrdersDao {}\n', message),
    ]);
  });

  it('rejects DAO-to-DAO imports', async () => {
    await expectRejected(
      'system/database/orders/orders.dao.ts',
      `import { findUser } from '../users/users.dao';\n`,
      'DAO implementation modules must not import other DAO implementation modules.',
    );
  });

  it('keeps DDL in migration infrastructure', async () => {
    const source = `const statement = 'CREATE TABLE orders (id TEXT)';\n`;
    const message = 'Schema DDL is allowed only in migrations/';
    await Promise.all([
      expectRejected('system/database/orders/orders.dao.ts', source, message),
      expectAllowed('system/database/migrate.ts', source),
      expectAllowed('tests/setup/testDatabase.ts', source),
    ]);
  });
});

describe('database-sqlite test boundaries', () => {
  const rule = 'database-sqlite/test-boundaries';

  it('exposes only the managed hook from testDatabase', async () => {
    await Promise.all([
      expectAllowedByRule(
        rule,
        'tests/setup/testDatabase.ts',
        `export function useIsolatedTestDatabase(): void {}\n`,
      ),
      expectRejectedByRule(
        rule,
        'tests/setup/testDatabase.ts',
        `export function releaseDatabaseForTests(): void {}\n`,
        'testDatabase.ts may export only useIsolatedTestDatabase.',
      ),
      expectRejectedByRule(
        rule,
        'tests/integration/orders.test.ts',
        `import { releaseDatabaseForTests } from '@/tests/setup/testDatabase';\n`,
        'Import only useIsolatedTestDatabase from tests/setup/testDatabase.ts.',
      ),
      expectRejectedByRule(
        rule,
        'tests/integration/orders.test.ts',
        `import { createTestDatabase } from '@/tests/setup/test-database';\n`,
        'Import only useIsolatedTestDatabase from tests/setup/testDatabase.ts.',
      ),
    ]);
  });

  it('keeps migration and connection test controls inside the managed setup', async () => {
    const message =
      'SQLite migration and test connection infrastructure is available only from tests/setup/testDatabase.ts.';
    await Promise.all([
      expectRejectedByRule(
        rule,
        'tests/integration/orders.test.ts',
        `import { runDatabaseMigrations } from '@/system/database/migrate';\n`,
        message,
      ),
      expectRejectedByRule(
        rule,
        'tests/integration/orders.test.ts',
        `import { installDatabaseForTests } from '@/system/database/connection';\n`,
        message,
      ),
      expectRejectedByRule(
        rule,
        'tests/integration/orders.test.ts',
        sourceLines(
          `import * as connection from '@/system/database/connection';`,
          'connection.installDatabaseForTests(database);',
        ),
        message,
      ),
      expectRejectedByRule(
        rule,
        'tests/unit/orders.test.ts',
        `import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';\n`,
        'Unit tests must not import tests/setup/testDatabase.ts.',
      ),
    ]);
  });

  it('rejects concurrent Bun tests only when the managed hook is active', async () => {
    const message =
      'Concurrent Bun tests are not allowed in files that use useIsolatedTestDatabase.';
    await Promise.all([
      expectRejectedByRule(
        rule,
        'tests/integration/orders.test.ts',
        sourceLines(
          `import { test as scenario } from 'bun:test';`,
          `import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';`,
          'useIsolatedTestDatabase(import.meta.path);',
          `scenario.concurrent('x', () => {});`,
        ),
        message,
      ),
      expectRejectedByRule(
        rule,
        'tests/integration/orders.test.ts',
        sourceLines(
          `import * as bunTest from 'bun:test';`,
          `import { useIsolatedTestDatabase } from '@/tests/setup/testDatabase';`,
          'useIsolatedTestDatabase(import.meta.path);',
          `bunTest.describe.concurrent('x', () => {});`,
        ),
        message,
      ),
      expectAllowedByRule(
        rule,
        'tests/unit/math.test.ts',
        sourceLines(`import { test } from 'bun:test';`, `test.concurrent('x', () => {});`),
      ),
    ]);
  });
});

type OxlintResult = {
  output: string;
  status: number;
};
