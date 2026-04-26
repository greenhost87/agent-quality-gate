import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { resolveCacheRoot, toRuntimeDir, toRuntimeVerifyBin } from '../runtime/paths.js';
import type { LauncherCliOptions, PackageJsonShape, UnknownJsonObject } from './launcher.types.js';

function helpText(): string {
  return ['Usage:', '  agent-quality-gate verify [args...]'].join('\n');
}

function readConfiguredVersion(packageJson: PackageJsonShape): string {
  const version = packageJson.agentQualityGate?.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('agent-quality-gate: package.json MUST contain agentQualityGate.version');
  }
  return version;
}

function isRecord(value: unknown): value is UnknownJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPackageJsonShape(value: unknown): value is PackageJsonShape {
  if (!isRecord(value)) {
    return false;
  }
  const config = value.agentQualityGate;
  return config === undefined || (isRecord(config) && (config.version === undefined || typeof config.version === 'string'));
}

async function readProjectPackageJson(cwd: string): Promise<PackageJsonShape> {
  const packageJsonPath = join(cwd, 'package.json');
  const parsed: unknown = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
  if (!isPackageJsonShape(parsed)) {
    throw new Error(`agent-quality-gate: invalid package.json shape: ${packageJsonPath}`);
  }
  return parsed;
}

export async function runAgentQualityGateCli(options: LauncherCliOptions = {}): Promise<number> {
  const argv = [...(options.argv ?? process.argv.slice(2))];
  const cwd = options.cwd ?? process.cwd();
  const command = argv.shift();
  if (command === '--help' || command === '-h') {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }
  if (command !== 'verify') {
    process.stderr.write(`${helpText()}\n`);
    return 2;
  }

  let version: string;
  try {
    version = readConfiguredVersion(await readProjectPackageJson(cwd));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }

  const verifyBin = toRuntimeVerifyBin(toRuntimeDir(resolveCacheRoot(), version));
  if (!existsSync(verifyBin)) {
    process.stderr.write(
      `agent-quality-gate runtime v${version} is not installed. Run: bunx agent-quality-gate-init --version ${version}\n`
    );
    return 1;
  }

  const result = spawnSync('bun', [verifyBin, ...argv], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: 'inherit',
  });
  return result.status ?? 1;
}
