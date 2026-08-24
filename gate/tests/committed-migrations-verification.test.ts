import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile, writeTextFile } from '../../process/files/files.js';
import { runCapturedProcess } from '../../process/run-command/run-command.js';

import { afterEach, describe, expect, it } from 'bun:test';

import { executeVerify } from '../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];
const configDependencies = {
  valibot: '1.4.2',
};
const databaseDependencies = {
  valibot: '1.4.2',
};
const databaseDevDependencies = {
  '@testcontainers/postgresql': '12.0.4',
  testcontainers: '12.0.4',
};
const databaseIgnoreScripts = ['ssh2', 'cpu-features'];

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function runGit(args: readonly string[], cwd: string): Promise<void> {
  const result = await runCapturedProcess({ command: 'git', args, cwd });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
}

async function createProject(options: {
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
  ignoreScripts?: readonly string[];
}): Promise<string> {
  const cwd = await makeTempDirectory('aqg-committed-migrations-project-');
  await mkdir(join(cwd, 'src'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'committed-migrations-fixture',
        private: true,
        type: 'module',
        ...(options.ignoreScripts !== undefined
          ? { ignoreScripts: [...options.ignoreScripts] }
          : {}),
        dependencies: options.dependencies,
        devDependencies: options.devDependencies ?? {},
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(join(cwd, 'src', 'index.ts'), 'export const value = 1;\n');
  return cwd;
}

async function commitMutatedMigration(cwd: string): Promise<void> {
  await mkdir(join(cwd, 'migrations'), { recursive: true });
  await writeTextFile(join(cwd, 'migrations', '001_initial.js'), 'export const up = () => {};\n');
  await runGit(['init', '--quiet', '-b', 'main'], cwd);
  await runGit(['add', '.'], cwd);
  await runGit(
    [
      '-c',
      'user.name=Test User',
      '-c',
      'user.email=test@example.com',
      '-c',
      'core.autocrlf=false',
      'commit',
      '--quiet',
      '-m',
      'add migration',
    ],
    cwd,
  );
  await writeTextFile(
    join(cwd, 'migrations', '001_initial.js'),
    'export const up = () => { /* mutated */ };\n',
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('committed migration verification', () => {
  it('rejects mutated committed migrations only when the database preset is active', async () => {
    const withDatabase = await createProject({
      dependencies: databaseDependencies,
      devDependencies: databaseDevDependencies,
      ignoreScripts: databaseIgnoreScripts,
    });
    await commitMutatedMigration(withDatabase);

    const withoutDatabase = await createProject({
      dependencies: configDependencies,
    });
    await commitMutatedMigration(withoutDatabase);

    const rejected = await executeVerify({
      projectRoot: withDatabase,
      entries: ['src/index.ts'],
      presets: ['database'],
    });
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr).toContain('database-committed-migration');
    expect(rejected.stderr).not.toContain('database-committed-migration:');
    expect(rejected.stderr).not.toContain('migrations/001_initial.js');
    expect(rejected.stderr).not.toContain('HEAD');
    expect(rejected.stderr).not.toContain('eslint(');
    expect(rejected.stderr).not.toContain('/* mutated */');
    expect(await readTextFile(join(withDatabase, 'migrations', '001_initial.js'))).toBe(
      'export const up = () => {};\n',
    );
    expect(await readTextFile(join(withDatabase, '.aqg', 'restored-migration.diff'))).toContain(
      '/* mutated */',
    );

    const inactive = await executeVerify({
      projectRoot: withoutDatabase,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(inactive.stderr).not.toContain('database-committed-migration');
    expect(await readTextFile(join(withoutDatabase, 'migrations', '001_initial.js'))).toBe(
      'export const up = () => { /* mutated */ };\n',
    );
  });
});
