#!/usr/bin/env bun

import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import packageJson from '../package.json' with { type: 'json' };
import { spawnCommand } from '../src/verify/spawn.js';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');
const RELEASE_PACKAGE_DIR = join(REPO_ROOT, '.tmp', 'release-package');
const RELEASE_DIST_BIN_DIR = join(RELEASE_PACKAGE_DIR, 'dist', 'bin');
const VERIFY_LAUNCHER_NAME = 'verify.js';

async function runRequired(
  command: string,
  args: readonly string[],
  cwd: string,
  inheritOutput: boolean
): Promise<string> {
  const result = await spawnCommand(command, args, cwd, inheritOutput);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} exited with code ${result.exitCode}`);
  }
  return result.stdout.trim();
}

async function buildVerifyLauncher(): Promise<void> {
  await runRequired(
    'bun',
    ['build', '--target', 'node', './bin/verify.ts', '--outfile', join(RELEASE_DIST_BIN_DIR, VERIFY_LAUNCHER_NAME)],
    REPO_ROOT,
    true
  );
}

async function writeReleasePackageJson(): Promise<void> {
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
    files: ['dist', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'],
  };
  await writeFile(
    join(RELEASE_PACKAGE_DIR, 'package.json'),
    `${JSON.stringify(releasePackageJson, null, 2)}\n`,
    'utf8'
  );
}

async function packReleasePackage(): Promise<void> {
  const filename = await runRequired(
    'npm',
    ['pack', '--ignore-scripts', '--cache', join(REPO_ROOT, '.npm-cache'), '--pack-destination', ARTIFACTS_DIR],
    RELEASE_PACKAGE_DIR,
    false
  );
  const packedPath = join(ARTIFACTS_DIR, basename(filename));
  const releasePath = join(ARTIFACTS_DIR, `agent-quality-gate-${packageJson.version}.tgz`);
  await rename(packedPath, releasePath);
}

async function main(): Promise<void> {
  await rm(ARTIFACTS_DIR, { recursive: true, force: true });
  await rm(RELEASE_PACKAGE_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await mkdir(RELEASE_DIST_BIN_DIR, { recursive: true });
  await buildVerifyLauncher();
  await cp(join(REPO_ROOT, 'README.md'), join(RELEASE_PACKAGE_DIR, 'README.md'));
  await cp(join(REPO_ROOT, 'LICENSE'), join(RELEASE_PACKAGE_DIR, 'LICENSE'));
  await cp(join(REPO_ROOT, 'THIRD_PARTY_NOTICES.md'), join(RELEASE_PACKAGE_DIR, 'THIRD_PARTY_NOTICES.md'));
  await writeReleasePackageJson();
  await packReleasePackage();
}

if (import.meta.main) {
  await main();
}
