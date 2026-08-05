#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rejectUnexpectedArgument, reportCommandError } from '../src/command.js';
import { readAgentQualityGateConfig } from '../src/verify/config/agent-quality-gate-config.js';
import { createGeneratedConfigFiles } from '../src/verify/config/generated-configs.js';
import { resolveIgnoredPaths } from '../src/verify/config/policy.js';
import { rejectOxlintDisableDirectives } from '../src/verify/lint-bypass-scanner.js';

const require = createRequire(import.meta.url);
const QUALITY_PLUGIN_PATH = fileURLToPath(new URL('../plugins/quality/index.mjs', import.meta.url));

function packageRoot(packageName: string): string {
  return dirname(require.resolve(`${packageName}/package.json`));
}

function tsgolintPath(): string {
  if (
    (process.platform !== 'darwin' && process.platform !== 'linux') ||
    (process.arch !== 'arm64' && process.arch !== 'x64')
  ) {
    throw new Error(`agent-quality-gate: unsupported platform ${process.platform}-${process.arch}`);
  }
  const tsgolintRequire = createRequire(require.resolve('oxlint-tsgolint/package.json'));
  const nativePackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
  return join(dirname(tsgolintRequire.resolve(`${nativePackage}/package.json`)), 'tsgolint');
}

function run(name: string, args: string[], environment?: Record<string, string>): number {
  const result = spawnSync(process.execPath, args, {
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });
  if (result.error) {
    process.stderr.write(`verify: failed to start ${name}: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

async function main(): Promise<number> {
  if (rejectUnexpectedArgument('verify')) {
    return 2;
  }

  const cwd = process.cwd();
  let projectConfig: ReturnType<typeof readAgentQualityGateConfig>;
  try {
    projectConfig = readAgentQualityGateConfig(cwd);
  } catch (error) {
    reportCommandError('verify', error instanceof Error ? error : String(error));
    return 2;
  }
  const ignoredPaths = resolveIgnoredPaths();
  const lintDirectiveCode = await rejectOxlintDisableDirectives(cwd, ignoredPaths);
  if (lintDirectiveCode !== 0) {
    return lintDirectiveCode;
  }

  const configs = createGeneratedConfigFiles(
    require.resolve('oxlint-plugin-eslint'),
    QUALITY_PLUGIN_PATH,
    projectConfig
  );
  try {
    const oxlintCode = run(
      'oxlint',
      [
        join(packageRoot('oxlint'), 'bin', 'oxlint'),
        '--type-aware',
        '--type-check',
        '--deny-warnings',
        '--config',
        configs.oxlint,
        ...ignoredPaths.flatMap((path) => ['--ignore-pattern', `${path}/**`]),
        '.',
      ],
      { OXLINT_TSGOLINT_PATH: tsgolintPath() }
    );
    if (oxlintCode !== 0) {
      return oxlintCode;
    }

    const fallowCode = run(
      'fallow',
      [
        join(packageRoot('fallow'), 'bin', 'fallow'),
        '--config',
        configs.fallow,
        '--fail-on-issues',
      ],
      { FALLOW_CACHE_DIR: join(cwd, 'node_modules', '.cache', 'agent-quality-gate', 'fallow') }
    );
    if (fallowCode !== 0) {
      return fallowCode;
    }

    process.stdout.write('verify: ok\n');
    return 0;
  } finally {
    rmSync(configs.directory, { recursive: true, force: true });
  }
}

process.exitCode = await main();
