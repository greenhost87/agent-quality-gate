import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { execa } from 'execa';

import { createProjectLauncherSource } from '../launcher/source.js';
import { RUNTIME_PACKAGE_NAME, resolveCacheRoot, toRuntimeDir, toRuntimeVerifyBin } from '../runtime/paths.js';
import type {
  InitCliOptions,
  PackageJsonShape,
  ParsedArgs,
  StringMap,
  ToolPackage,
  UnknownJsonObject,
} from './init.types.js';

const PROJECT_LAUNCHER_PATH = join('.agent-quality-gate', 'agent-quality-gate.mjs');
const VERIFY_SCRIPT = `bun ${PROJECT_LAUNCHER_PATH} verify`;
const INIT_PACKAGE_NAME = 'agent-quality-gate-init';
const DEFAULT_RELEASE_BASE_URL = 'https://github.com/greenhost87/agent-quality-gate/releases/download';

function helpText(): string {
  return [
    'Usage:',
    '  agent-quality-gate-init',
    '  agent-quality-gate-init --version <version>',
    '  agent-quality-gate-init --runtime-source <specifier>',
    '  agent-quality-gate-init --cache-dir <path>',
    '  agent-quality-gate-init --force',
  ].join('\n');
}

function parseArgs(argv: readonly string[]): ParsedArgs | { error: string } {
  const parsed: ParsedArgs = { force: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? '';
    if (value === '--help' || value === '-h') {
      return { ...parsed, help: true };
    }
    if (value === '--force') {
      parsed.force = true;
      continue;
    }
    if (value === '--version') {
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith('-')) {
        return { error: 'agent-quality-gate-init: missing value for "--version"' };
      }
      parsed.version = nextValue;
      index += 1;
      continue;
    }
    if (value === '--runtime-source') {
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith('-')) {
        return { error: 'agent-quality-gate-init: missing value for "--runtime-source"' };
      }
      parsed.runtimeSource = nextValue;
      index += 1;
      continue;
    }
    if (value === '--cache-dir') {
      const nextValue = argv[index + 1];
      if (!nextValue || nextValue.startsWith('-')) {
        return { error: 'agent-quality-gate-init: missing value for "--cache-dir"' };
      }
      parsed.cacheDir = nextValue;
      index += 1;
      continue;
    }
    return { error: `agent-quality-gate-init: unknown option "${value}"` };
  }
  return parsed;
}

function findProjectRoot(startDir: string): string {
  let currentDir = startDir;
  while (true) {
    if (existsSync(join(currentDir, 'package.json'))) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('agent-quality-gate-init: package.json not found');
    }
    currentDir = parentDir;
  }
}

function isRecord(value: unknown): value is UnknownJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is StringMap {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isAgentQualityGateConfig(value: unknown): value is PackageJsonShape['agentQualityGate'] {
  return value === undefined || (isRecord(value) && (value.version === undefined || typeof value.version === 'string'));
}

function isPackageJsonShape(value: unknown): value is PackageJsonShape {
  if (!isRecord(value)) {
    return false;
  }
  const scripts = value.scripts;
  const agentQualityGate = value.agentQualityGate;
  return (
    (value.name === undefined || typeof value.name === 'string') &&
    (value.version === undefined || typeof value.version === 'string') &&
    (scripts === undefined || isStringRecord(scripts)) &&
    isAgentQualityGateConfig(agentQualityGate)
  );
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJsonShape> {
  const raw = await readFile(packageJsonPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!isPackageJsonShape(parsed)) {
    throw new Error(`agent-quality-gate-init: invalid package.json shape: ${packageJsonPath}`);
  }
  return parsed;
}

async function findToolPackage(startUrl: string): Promise<ToolPackage> {
  let currentDir = dirname(fileURLToPath(startUrl));
  while (true) {
    const packageJsonPath = join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = await readPackageJson(packageJsonPath);
      if (
        (packageJson.name === RUNTIME_PACKAGE_NAME || packageJson.name === INIT_PACKAGE_NAME) &&
        typeof packageJson.version === 'string' &&
        packageJson.version.length > 0
      ) {
        return {
          name: packageJson.name,
          root: currentDir,
          version: packageJson.version,
        };
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('agent-quality-gate-init: unable to locate package root');
    }
    currentDir = parentDir;
  }
}

function defaultReleaseRuntimeSource(version: string): string {
  return `${DEFAULT_RELEASE_BASE_URL}/v${version}/agent-quality-gate-${version}.tgz`;
}

function resolveRuntimeSource(toolPackage: ToolPackage, version: string, explicitSource?: string): string {
  if (explicitSource) {
    return explicitSource;
  }
  if (process.env.AGENT_QUALITY_GATE_RUNTIME_SOURCE) {
    return process.env.AGENT_QUALITY_GATE_RUNTIME_SOURCE;
  }
  if (toolPackage.name === RUNTIME_PACKAGE_NAME && toolPackage.version === version) {
    return pathToFileURL(toolPackage.root).toString();
  }
  return defaultReleaseRuntimeSource(version);
}

async function installRuntime(options: {
  cacheRoot: string;
  force: boolean;
  runtimeSource: string;
  version: string;
}): Promise<{ installed: boolean; runtimeDir: string; verifyBin: string }> {
  const runtimeDir = toRuntimeDir(options.cacheRoot, options.version);
  const verifyBin = toRuntimeVerifyBin(runtimeDir);
  if (existsSync(verifyBin) && !options.force) {
    return { installed: false, runtimeDir, verifyBin };
  }

  if (existsSync(runtimeDir)) {
    if (!options.force) {
      throw new Error(`agent-quality-gate-init: runtime directory exists but is incomplete: ${runtimeDir}`);
    }
    await rm(runtimeDir, { recursive: true, force: true });
  }

  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    join(runtimeDir, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          [RUNTIME_PACKAGE_NAME]: options.runtimeSource,
        },
        trustedDependencies: [],
      },
      null,
      2
    )}\n`,
    'utf-8'
  );

  await execa('bun', ['install'], {
    cwd: runtimeDir,
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  if (!existsSync(verifyBin)) {
    throw new Error(`agent-quality-gate-init: runtime install did not create ${verifyBin}`);
  }

  return { installed: true, runtimeDir, verifyBin };
}

function updatePackageJson(packageJson: PackageJsonShape, version: string, force: boolean): PackageJsonShape {
  const scripts = packageJson.scripts ?? {};
  const existingVerifyScript = scripts.verify;
  if (existingVerifyScript && existingVerifyScript !== VERIFY_SCRIPT && !force) {
    throw new Error(
      `agent-quality-gate-init: scripts.verify already exists. Re-run with --force to replace it with "${VERIFY_SCRIPT}".`
    );
  }

  const existingVersion = packageJson.agentQualityGate?.version;
  if (existingVersion && existingVersion !== version && !force) {
    throw new Error(
      `agent-quality-gate-init: agentQualityGate.version is "${existingVersion}". Re-run with --force to set "${version}".`
    );
  }

  return {
    ...packageJson,
    scripts: {
      ...scripts,
      verify: VERIFY_SCRIPT,
    },
    agentQualityGate: {
      ...(packageJson.agentQualityGate ?? {}),
      version,
    },
  };
}

async function writeProjectLauncher(projectRoot: string, force: boolean): Promise<string> {
  const launcherPath = join(projectRoot, PROJECT_LAUNCHER_PATH);
  const source = createProjectLauncherSource();
  await assertProjectLauncherWritable(projectRoot, force);
  await mkdir(dirname(launcherPath), { recursive: true });
  await writeFile(launcherPath, source, { encoding: 'utf-8', mode: 0o755 });
  return launcherPath;
}

async function assertProjectLauncherWritable(projectRoot: string, force: boolean): Promise<void> {
  const launcherPath = join(projectRoot, PROJECT_LAUNCHER_PATH);
  if (existsSync(launcherPath) && !force) {
    const source = createProjectLauncherSource();
    const existing = await readFile(launcherPath, 'utf-8');
    if (existing !== source) {
      throw new Error(`agent-quality-gate-init: ${PROJECT_LAUNCHER_PATH} already exists. Re-run with --force to replace it.`);
    }
  }
}

export async function runAgentQualityGateInitCli(options: InitCliOptions = {}): Promise<number> {
  const parsed = parseArgs(options.argv ?? process.argv.slice(2));
  if ('error' in parsed) {
    process.stderr.write(`${parsed.error}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }

  try {
    const toolPackage = await findToolPackage(import.meta.url);
    const version = parsed.version ?? toolPackage.version;
    const projectRoot = findProjectRoot(options.cwd ?? process.cwd());
    const packageJsonPath = join(projectRoot, 'package.json');
    const cacheRoot = resolveCacheRoot(parsed.cacheDir);
    const runtimeSource = resolveRuntimeSource(toolPackage, version, parsed.runtimeSource);
    const packageJson = updatePackageJson(await readPackageJson(packageJsonPath), version, parsed.force);
    await assertProjectLauncherWritable(projectRoot, parsed.force);

    const runtime = await installRuntime({
      cacheRoot,
      force: parsed.force,
      runtimeSource,
      version,
    });

    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf-8');
    const launcherPath = await writeProjectLauncher(projectRoot, parsed.force);

    process.stdout.write(`agent-quality-gate-init: runtime ${runtime.installed ? 'installed' : 'already installed'} ${version}\n`);
    process.stdout.write(`agent-quality-gate-init: runtime-dir ${runtime.runtimeDir}\n`);
    process.stdout.write(`agent-quality-gate-init: updated ${packageJsonPath}\n`);
    process.stdout.write(`agent-quality-gate-init: updated ${launcherPath}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
}
