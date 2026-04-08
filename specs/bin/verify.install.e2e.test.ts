import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'bun:test';

const RUN_INSTALL_E2E = process.env.VERIFY_INSTALL_E2E === '1';
const testSuite = RUN_INSTALL_E2E ? describe : describe.skip;
const INSTALL_E2E_TIMEOUT_MS = 180_000;

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const createdTempDirs: string[] = [];

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function commandLabel(command: string, args: readonly string[]): string {
  return `${command} ${args.join(' ')}`;
}

function logCommandResult(label: string, command: string, args: readonly string[], result: CommandResult): void {
  const status = result.code === 0 ? 'ok' : 'fail';
  process.stderr.write(
    `verify: install-e2e ${label} [${status}] ${result.durationMs}ms: ${commandLabel(command, args)}\n`
  );
}

async function runCommand(
  cwd: string,
  command: string,
  args: string[],
  env: Record<string, string> = {}
): Promise<CommandResult> {
  const startedAt = Date.now();
  const tempDir = env.TMPDIR ?? join(cwd, '.tmp');
  const npmCacheDir = env.npm_config_cache ?? join(cwd, '.npm-cache');
  await mkdir(tempDir, { recursive: true });
  await mkdir(npmCacheDir, { recursive: true });
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      TMPDIR: tempDir,
      npm_config_cache: npmCacheDir,
      ...env,
    },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: Date.now() - startedAt,
  };
}

function assertCommandOk(result: CommandResult, message: string): void {
  if (result.code === 0) {
    return;
  }
  throw new Error([message, `stdout:\n${result.stdout}`, `stderr:\n${result.stderr}`].join('\n'));
}

function isInfraBlocked(result: CommandResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`;
  return (
    output.includes('PermissionDenied') ||
    output.includes('unable to write files to tempdir') ||
    output.includes('EAI_AGAIN') ||
    output.includes('ENOTFOUND') ||
    output.includes('ECONNREFUSED') ||
    output.includes('ETIMEDOUT')
  );
}

function assertCommandOkOrSkip(result: CommandResult, message: string): boolean {
  if (result.code === 0) {
    return true;
  }
  if (isInfraBlocked(result)) {
    process.stderr.write(`verify: install-e2e infra skip: ${message}\n`);
    return false;
  }
  assertCommandOk(result, message);
  return true;
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  createdTempDirs.push(dir);
  return dir;
}

async function writeConsumerPackageJson(cwd: string): Promise<void> {
  await writeFile(
    join(cwd, 'package.json'),
    JSON.stringify(
      {
        name: 'verify-consumer-e2e',
        private: true,
        type: 'module',
        scripts: {
          verify: 'verify',
        },
      },
      null,
      2
    ),
    'utf-8'
  );
}

async function findLatestTarball(artifactsDir: string): Promise<string> {
  const files = await readdir(artifactsDir);
  const tarballs = files.filter((file) => file.endsWith('.tgz'));
  if (tarballs.length === 0) {
    throw new Error(`no tarballs found in ${artifactsDir}`);
  }

  const withStats = await Promise.all(
    tarballs.map(async (fileName) => ({
      fileName,
      mtimeMs: (await stat(join(artifactsDir, fileName))).mtimeMs,
    }))
  );
  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return join(artifactsDir, withStats[0]?.fileName ?? '');
}

async function readPackageVersion(cwd: string): Promise<string> {
  const raw = await readFile(join(cwd, 'package.json'), 'utf-8');
  const parsed = JSON.parse(raw) as { version?: string };
  if (!parsed.version) {
    throw new Error('missing package version');
  }
  return parsed.version;
}

async function copyRepoWithoutGit(sourceRepo: string, targetRepo: string): Promise<void> {
  await cp(sourceRepo, targetRepo, {
    recursive: true,
    filter: (entryPath) => {
      const relPath = relative(sourceRepo, entryPath);
      if (relPath === '') {
        return true;
      }
      return !(
        relPath.startsWith('.git') ||
        relPath.startsWith('node_modules') ||
        relPath.startsWith('dist') ||
        relPath.startsWith('artifacts') ||
        relPath.startsWith('.idea')
      );
    },
  });
}

testSuite('verify package install e2e', () => {
  afterEach(async () => {
    await Promise.all(
      createdTempDirs.splice(0).map(async (dir) => {
        await rm(dir, { recursive: true, force: true });
      })
    );
  });

  it(
    'installs from tarball and exposes verify command',
    async () => {
      const packResult = await runCommand(REPO_ROOT, 'bun', ['run', 'pack:verify']);
      logCommandResult('pack', 'bun', ['run', 'pack:verify'], packResult);
      if (!assertCommandOkOrSkip(packResult, 'pack:verify failed')) {
        return;
      }

      const artifactPath = await findLatestTarball(join(REPO_ROOT, 'artifacts'));
      const consumerDir = await makeTempDir('verify-consumer-tgz-');
      await writeConsumerPackageJson(consumerDir);

      const installResult = await runCommand(consumerDir, 'npm', ['install', '--save-dev', `file:${artifactPath}`]);
      logCommandResult('install-tarball', 'npm', ['install', '--save-dev', `file:${artifactPath}`], installResult);
      if (!assertCommandOkOrSkip(installResult, 'npm install from tarball failed')) {
        return;
      }

      const help = await runCommand(consumerDir, 'npm', ['run', 'verify', '--', '--help']);
      logCommandResult('smoke-help-tarball', 'npm', ['run', 'verify', '--', '--help'], help);
      assertCommandOk(help, 'verify command from tarball failed');
      expect(help.stdout).toContain('Usage:');
    },
    INSTALL_E2E_TIMEOUT_MS
  );

  it(
    'installs from local git tag and exposes verify command',
    async () => {
      const sourceRepo = await makeTempDir('verify-source-repo-');
      const consumerDir = await makeTempDir('verify-consumer-git-');

      await copyRepoWithoutGit(REPO_ROOT, sourceRepo);
      const version = await readPackageVersion(sourceRepo);
      const tagName = `v${version}`;

      const initResult = await runCommand(sourceRepo, 'git', ['init']);
      logCommandResult('git-init', 'git', ['init'], initResult);
      assertCommandOk(initResult, 'git init failed');
      const emailResult = await runCommand(sourceRepo, 'git', ['config', 'user.email', 'verify@example.test']);
      logCommandResult('git-config-email', 'git', ['config', 'user.email', 'verify@example.test'], emailResult);
      assertCommandOk(emailResult, 'git config user.email failed');
      const nameResult = await runCommand(sourceRepo, 'git', ['config', 'user.name', 'Verify E2E']);
      logCommandResult('git-config-name', 'git', ['config', 'user.name', 'Verify E2E'], nameResult);
      assertCommandOk(nameResult, 'git config user.name failed');
      const addResult = await runCommand(sourceRepo, 'git', ['add', '.']);
      logCommandResult('git-add', 'git', ['add', '.'], addResult);
      assertCommandOk(addResult, 'git add failed');
      const commitResult = await runCommand(sourceRepo, 'git', ['commit', '-m', 'verify e2e snapshot']);
      logCommandResult('git-commit', 'git', ['commit', '-m', 'verify e2e snapshot'], commitResult);
      assertCommandOk(commitResult, 'git commit failed');
      const tagResult = await runCommand(sourceRepo, 'git', ['tag', tagName]);
      logCommandResult('git-tag', 'git', ['tag', tagName], tagResult);
      assertCommandOk(tagResult, 'git tag failed');

      await writeConsumerPackageJson(consumerDir);
      const installResult = await runCommand(consumerDir, 'npm', [
        'install',
        '--save-dev',
        `git+file://${sourceRepo}#${tagName}`,
      ]);
      logCommandResult(
        'install-git-tag',
        'npm',
        ['install', '--save-dev', `git+file://${sourceRepo}#${tagName}`],
        installResult
      );
      if (!assertCommandOkOrSkip(installResult, 'npm install from git tag failed')) {
        return;
      }

      const help = await runCommand(consumerDir, 'npm', ['run', 'verify', '--', '--help']);
      logCommandResult('smoke-help-git-tag', 'npm', ['run', 'verify', '--', '--help'], help);
      assertCommandOk(help, 'verify command from git tag failed');
      expect(help.stdout).toContain('Usage:');
    },
    INSTALL_E2E_TIMEOUT_MS
  );
});
