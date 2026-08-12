#!/usr/bin/env node

import { spawn } from 'node:child_process';
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
const FALLOW_INFORMATIONAL_PREFIXES = [
  'health-score:',
  'vital-signs:',
  'file-score:',
  'hotspot:',
  'refactoring-target:',
];

function removeFallowInformation(output: string): string {
  return output
    .split('\n')
    .filter((line) => !FALLOW_INFORMATIONAL_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .join('\n');
}

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

function run(
  name: string,
  args: string[],
  environment?: Record<string, string>
): Promise<{ exitCode: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...environment },
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
    child.once('error', (error) => {
      process.stderr.write(`verify: failed to start ${name}: ${error.message}\n`);
      resolve({ exitCode: 1, stdout: Buffer.concat(stdout).toString('utf8') });
    });
    child.once('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout: Buffer.concat(stdout).toString('utf8') });
    });
  });
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
    const oxlintEnvironment = { OXLINT_TSGOLINT_PATH: tsgolintPath() };
    const oxlintExecutable = join(packageRoot('oxlint'), 'bin', 'oxlint');
    const oxlintArgs = [
      oxlintExecutable,
      '--format',
      'agent',
      '--type-aware',
      '--type-check',
      '--deny-warnings',
      '--config',
      configs.oxlint,
      ...ignoredPaths.flatMap((path) => ['--ignore-pattern', `${path}/**`]),
      '.',
    ];
    const fallowEnvironment = {
      FALLOW_CACHE_DIR: join(cwd, 'node_modules', '.cache', 'agent-quality-gate', 'fallow'),
    };
    const fallowExecutable = join(packageRoot('fallow'), 'bin', 'fallow');
    const fallowArgs = [
      fallowExecutable,
      '--config',
      configs.fallow,
      '--format',
      'compact',
      '--quiet',
      '--fail-on-issues',
    ];
    const [oxlint, fallow] = await Promise.all([
      run('oxlint', oxlintArgs, oxlintEnvironment),
      run('fallow', fallowArgs, fallowEnvironment),
    ]);
    const exitCode = Math.max(oxlint.exitCode, fallow.exitCode);
    if (exitCode !== 0) {
      const output = [oxlint.stdout.trimEnd(), removeFallowInformation(fallow.stdout).trimEnd()]
        .filter((value) => value.length > 0)
        .join('\n\n');
      if (output) {
        process.stdout.write(`${output}\n`);
      }
      return exitCode;
    }

    process.stdout.write('verify: ok\n');
    return 0;
  } finally {
    rmSync(configs.directory, { recursive: true, force: true });
  }
}

process.exitCode = await main();
