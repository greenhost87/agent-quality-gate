import { realpathSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../process/files/files.js';
import { runCapturedProcess } from '../../process/run-command/run-command.js';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';
import { readFixture } from '../../tests/support/fixture-files.js';
import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '../../config/global-config/global-config.js';
import { executeQualityGateForCwd } from '../quality-gate-run/quality-gate-run.js';
import type { LinkedCheckoutOptions } from './quality-gate-linked-checkout.types.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(
  import.meta.dir,
  '..',
  '.quality-fixtures',
  'quality-gate-linked-checkout',
);

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

async function writeProjectFiles(
  root: string,
  fixtureCase: 'clean-function' | 'debugger-with-export',
): Promise<void> {
  const source = await readFixture(FIXTURES_ROOT, fixtureCase, 'src/index.ts');
  await mkdir(join(root, 'src'), { recursive: true });
  await writeTextFile(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'aqg-linked-checkout', private: true, type: 'module' }, null, 2)}\n`,
  );
  await writeTextFile(
    join(root, 'tsconfig.json'),
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
  await writeTextFile(join(root, 'src', 'index.ts'), source);
}

async function writeGlobalConfig(
  directory: string,
  root: string,
  extra: { presets?: readonly string[] } = {},
): Promise<string> {
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(
    configPath,
    YAML.stringify(
      {
        projects: [
          {
            root,
            entries: ['src/index.ts'],
            ...(extra.presets === undefined ? {} : { presets: extra.presets }),
          },
        ],
      },
      null,
      2,
    ),
  );
  return configPath;
}

async function createLinkedCheckout(
  options: LinkedCheckoutOptions,
): Promise<{ configPath: string; main: string; worktree: string }> {
  const main = await makeTempDirectory('aqg-linked-checkout-main-');
  await writeProjectFiles(main, 'clean-function');
  await runGit(['init', '--quiet', '-b', 'main'], main);
  await runGit(['add', '.'], main);
  await runGit(
    [
      '-c',
      'user.name=Test User',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '-m',
      'Initial',
    ],
    main,
  );
  const worktree =
    options.layout === 'external'
      ? join(
          await makeTempDirectory('aqg-linked-checkout-host-'),
          'a1b2c3d4e5f67890',
          '01a0107c-ef20-7a94-9bed-54c62f743b1b',
        )
      : join(main, '.pi-foreman', 'worktrees', '01a00e51-7179-7112-8a08-897e9db224f6');
  await mkdir(join(worktree, '..'), { recursive: true });
  await runGit(['worktree', 'add', '--quiet', '-b', 'task', worktree], main);
  if (options.mainFixture !== 'clean-function') {
    await writeProjectFiles(main, options.mainFixture);
  }
  if (options.worktreeFixture !== 'clean-function') {
    await writeProjectFiles(worktree, options.worktreeFixture);
  }
  const configPath = await writeGlobalConfig(
    await makeTempDirectory('aqg-linked-checkout-config-'),
    main,
    { presets: options.presets },
  );
  return { configPath, main, worktree };
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('quality gate linked checkout', () => {
  it('runs against a nested git worktree instead of the configured main checkout', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'debugger-with-export',
      worktreeFixture: 'clean-function',
    });

    const run = await executeQualityGateForCwd(worktree, { configPath });

    expect(run.kind).toBe('ran');
    if (run.kind !== 'ran') {
      return;
    }
    expect(run.projectRoot).toBe(realpathSync(worktree));
    expect(run.result.exitCode).toBe(0);
  });

  it('reports violations from the nested git worktree rather than a clean main checkout', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'clean-function',
      worktreeFixture: 'debugger-with-export',
    });

    const run = await executeQualityGateForCwd(worktree, { configPath });
    const output = run.kind === 'ran' ? run.result.stdout + run.result.stderr : '';

    expect(run.kind).toBe('ran');
    if (run.kind !== 'ran') {
      return;
    }
    expect(run.projectRoot).toBe(realpathSync(worktree));
    expect(run.result.exitCode).toBe(1);
    expect(output).toContain('eslint(no-debugger)');
  });

  it('runs against the nested git worktree when cwd is a subdirectory of that worktree', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'debugger-with-export',
      worktreeFixture: 'clean-function',
    });

    const run = await executeQualityGateForCwd(join(worktree, 'src'), { configPath });

    expect(run.kind).toBe('ran');
    if (run.kind !== 'ran') {
      return;
    }
    expect(run.projectRoot).toBe(realpathSync(worktree));
    expect(run.result.exitCode).toBe(0);
  });

  it('keeps the configured root when cwd is a subdirectory of main', async () => {
    const { configPath, main } = await createLinkedCheckout({
      mainFixture: 'debugger-with-export',
      worktreeFixture: 'clean-function',
    });

    const run = await executeQualityGateForCwd(join(main, 'src'), { configPath });

    expect(run.kind).toBe('ran');
    if (run.kind !== 'ran') {
      return;
    }
    expect(run.projectRoot).toBe(realpathSync(main));
    expect(run.result.exitCode).toBe(1);
  });

  it('selects the configured project presets for an external git worktree', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'clean-function',
      worktreeFixture: 'clean-function',
      layout: 'external',
      presets: ['config'],
    });

    const project = findProjectForCwd(
      worktree,
      (await readGlobalQualityGateConfig(configPath)).projects,
    );

    expect(project?.presets).toEqual(['config']);
  });

  it('runs against an external git worktree of a configured project', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'debugger-with-export',
      worktreeFixture: 'clean-function',
      layout: 'external',
    });

    const run = await executeQualityGateForCwd(worktree, { configPath });

    expect(run.kind).toBe('ran');
    if (run.kind !== 'ran') {
      return;
    }
    expect(run.projectRoot).toBe(realpathSync(worktree));
    expect(run.result.exitCode).toBe(0);
  });

  it('reports violations from an external git worktree rather than a clean main checkout', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'clean-function',
      worktreeFixture: 'debugger-with-export',
      layout: 'external',
    });

    const run = await executeQualityGateForCwd(worktree, { configPath });
    const output = run.kind === 'ran' ? run.result.stdout + run.result.stderr : '';

    expect(run.kind).toBe('ran');
    if (run.kind !== 'ran') {
      return;
    }
    expect(run.projectRoot).toBe(realpathSync(worktree));
    expect(run.result.exitCode).toBe(1);
    expect(output).toContain('eslint(no-debugger)');
  });

  it('runs against an external git worktree when cwd is a subdirectory of that worktree', async () => {
    const { configPath, worktree } = await createLinkedCheckout({
      mainFixture: 'debugger-with-export',
      worktreeFixture: 'clean-function',
      layout: 'external',
    });

    const run = await executeQualityGateForCwd(join(worktree, 'src'), { configPath });

    expect(run.kind).toBe('ran');
    if (run.kind !== 'ran') {
      return;
    }
    expect(run.projectRoot).toBe(realpathSync(worktree));
    expect(run.result.exitCode).toBe(0);
  });

  it('skips a separate git checkout that does not share a repository with a configured project', async () => {
    const { configPath } = await createLinkedCheckout({
      mainFixture: 'clean-function',
      worktreeFixture: 'clean-function',
      layout: 'external',
    });
    const other = await makeTempDirectory('aqg-linked-checkout-other-');
    await writeProjectFiles(other, 'debugger-with-export');
    await runGit(['init', '--quiet', '-b', 'main'], other);

    const run = await executeQualityGateForCwd(other, { configPath });

    expect(run.kind).toBe('skipped');
  });
});
