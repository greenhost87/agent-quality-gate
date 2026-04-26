import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'bun:test';

const REPO_ROOT = new URL('../../', import.meta.url).pathname;
const INIT_BIN_PATH = join(REPO_ROOT, 'bin', 'agent-quality-gate-init.ts');
const TEST_VERSION = '9.9.9-test';
const SLOW_INIT_TIMEOUT_MS = 30_000;
const createdTempDirs: string[] = [];

interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

interface InitializedPackageJson {
  agentQualityGate?: { version?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function isInitializedPackageJson(value: unknown): value is InitializedPackageJson {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const agentQualityGate = 'agentQualityGate' in value ? value.agentQualityGate : undefined;
  return (
    (agentQualityGate === undefined ||
      (typeof agentQualityGate === 'object' &&
        agentQualityGate !== null &&
        (!('version' in agentQualityGate) || typeof agentQualityGate.version === 'string'))) &&
    (!('dependencies' in value) || isStringRecord(value.dependencies)) &&
    (!('devDependencies' in value) || isStringRecord(value.devDependencies)) &&
    (!('scripts' in value) || isStringRecord(value.scripts))
  );
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  createdTempDirs.push(dir);
  return dir;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function runCommand(cwd: string, command: string, args: string[], env: Record<string, string> = {}): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0', ...env },
  });
  return {
    code: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

async function writeMockRuntimePackage(cwd: string): Promise<string> {
  const runtimeDir = join(cwd, 'mock-runtime');
  await mkdir(join(runtimeDir, 'dist', 'bin'), { recursive: true });
  await writeJson(join(runtimeDir, 'package.json'), {
    name: 'agent-quality-gate',
    version: TEST_VERSION,
    type: 'module',
    bin: {
      verify: './dist/bin/verify.js',
    },
  });
  await writeFile(
    join(runtimeDir, 'dist', 'bin', 'verify.js'),
    [
      '#!/usr/bin/env bun',
      'process.stdout.write(`mock verify ${process.argv.slice(2).join(" ")}\\n`);',
      '',
    ].join('\n'),
    { encoding: 'utf-8', mode: 0o755 }
  );
  return runtimeDir;
}

describe('agent-quality-gate init', () => {
  afterEach(async () => {
    await Promise.all(
      createdTempDirs.splice(0).map(async (dir) => {
        await rm(dir, { recursive: true, force: true });
      })
    );
  });

  it(
    'installs runtime outside the project and wires verify without adding dependencies',
    async () => {
      const workspaceDir = await makeTempDir('aqg-init-workspace-');
      const projectDir = join(workspaceDir, 'consumer');
      const cacheDir = join(workspaceDir, 'cache');
      await mkdir(projectDir, { recursive: true });
      await writeJson(join(projectDir, 'package.json'), {
        name: 'consumer',
        private: true,
        type: 'module',
      });
      const runtimeSource = pathToFileURL(await writeMockRuntimePackage(workspaceDir)).toString();

      const init = runCommand(projectDir, 'bun', [
        INIT_BIN_PATH,
        '--version',
        TEST_VERSION,
        '--runtime-source',
        runtimeSource,
        '--cache-dir',
        cacheDir,
      ]);

      expect(init.code).toBe(0);
      expect(init.stdout).toContain(`runtime installed ${TEST_VERSION}`);

      const packageJson: unknown = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf-8'));
      expect(isInitializedPackageJson(packageJson)).toBe(true);
      if (!isInitializedPackageJson(packageJson)) {
        throw new Error('init wrote an unexpected package.json shape');
      }
      expect(packageJson.agentQualityGate?.version).toBe(TEST_VERSION);
      expect(packageJson.scripts?.verify).toBe('bun .agent-quality-gate/agent-quality-gate.mjs verify');
      expect(packageJson.dependencies?.['agent-quality-gate']).toBeUndefined();
      expect(packageJson.devDependencies?.['agent-quality-gate']).toBeUndefined();

      const verify = runCommand(projectDir, 'bun', ['run', 'verify', '--', '--probe'], {
        AGENT_QUALITY_GATE_CACHE_DIR: cacheDir,
      });
      expect(verify.code).toBe(0);
      expect(verify.stdout).toContain('mock verify --probe');
    },
    SLOW_INIT_TIMEOUT_MS
  );

  it(
    'does not install runtime when scripts.verify would be replaced without force',
    async () => {
      const workspaceDir = await makeTempDir('aqg-init-conflict-');
      const projectDir = join(workspaceDir, 'consumer');
      const cacheDir = join(workspaceDir, 'cache');
      await mkdir(projectDir, { recursive: true });
      await writeJson(join(projectDir, 'package.json'), {
        name: 'consumer',
        private: true,
        scripts: {
          verify: 'echo existing',
        },
      });
      const runtimeSource = pathToFileURL(await writeMockRuntimePackage(workspaceDir)).toString();

      const init = runCommand(projectDir, 'bun', [
        INIT_BIN_PATH,
        '--version',
        TEST_VERSION,
        '--runtime-source',
        runtimeSource,
        '--cache-dir',
        cacheDir,
      ]);

      expect(init.code).toBe(1);
      expect(init.stderr).toContain('scripts.verify already exists');
      expect(runCommand(workspaceDir, 'test', ['!', '-e', join(cacheDir, 'runtimes', `v${TEST_VERSION}`)]).code).toBe(0);
    },
    SLOW_INIT_TIMEOUT_MS
  );
});
