#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import packageJson from '../package.json' with { type: 'json' };

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');
const VERIFY_LAUNCHER_NAME = 'verify.js';

function runRequired(command: string, args: readonly string[], cwd: string, inheritOutput: boolean): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: inheritOutput ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} exited with code ${String(result.status)}`);
  }
}

function buildVerifyLauncher(releaseDistBinDir: string): void {
  runRequired(
    'bun',
    ['build', '--target', 'node', './bin/verify.ts', '--outfile', join(releaseDistBinDir, VERIFY_LAUNCHER_NAME)],
    REPO_ROOT,
    true
  );
}

async function writeReleasePackageJson(releasePackageDir: string): Promise<void> {
  const releasePackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    type: packageJson.type,
    description: packageJson.description,
    license: packageJson.license,
    author: packageJson.author,
    repository: packageJson.repository,
    homepage: packageJson.homepage,
    bugs: packageJson.bugs,
    keywords: packageJson.keywords,
    engines: {
      node: packageJson.engines.node,
    },
    os: ['darwin', 'linux'],
    cpu: ['arm64', 'x64'],
    dependencies: {
      fallow: packageJson.devDependencies.fallow,
      oxlint: packageJson.devDependencies.oxlint,
      'oxlint-plugin-eslint': packageJson.devDependencies['oxlint-plugin-eslint'],
      'oxlint-tsgolint': packageJson.devDependencies['oxlint-tsgolint'],
    },
    bin: {
      verify: `./dist/bin/${VERIFY_LAUNCHER_NAME}`,
    },
    files: ['dist', 'README.md', 'LICENSE'],
  };
  await writeFile(
    join(releasePackageDir, 'package.json'),
    `${JSON.stringify(releasePackageJson, null, 2)}\n`,
    'utf8'
  );
}

function packReleasePackage(releasePackageDir: string): void {
  runRequired(
    'bun',
    ['pm', 'pack', '--ignore-scripts', '--destination', ARTIFACTS_DIR],
    releasePackageDir,
    false
  );
}

async function main(): Promise<void> {
  const releasePackageDir = await mkdtemp(join(tmpdir(), 'agent-quality-gate-release-'));
  const releaseDistDir = join(releasePackageDir, 'dist');
  const releaseDistBinDir = join(releaseDistDir, 'bin');
  const releaseDistPluginsDir = join(releaseDistDir, 'plugins');
  try {
    await rm(ARTIFACTS_DIR, { recursive: true, force: true });
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await mkdir(releaseDistBinDir, { recursive: true });
    await mkdir(releaseDistPluginsDir, { recursive: true });
    buildVerifyLauncher(releaseDistBinDir);
    await cp(join(REPO_ROOT, 'plugins', 'quality'), join(releaseDistPluginsDir, 'quality'), { recursive: true });
    await cp(join(REPO_ROOT, 'README.md'), join(releasePackageDir, 'README.md'));
    await cp(join(REPO_ROOT, 'LICENSE'), join(releasePackageDir, 'LICENSE'));
    await writeReleasePackageJson(releasePackageDir);
    packReleasePackage(releasePackageDir);
  } finally {
    await rm(releasePackageDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await main();
}
