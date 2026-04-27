#!/usr/bin/env bun

import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

import { executableExtension, runtimePlatform } from '../src/runtime/paths.js';

interface PackageJsonShape {
  author?: unknown;
  bugs?: unknown;
  description?: unknown;
  homepage?: unknown;
  keywords?: unknown;
  license?: unknown;
  name?: unknown;
  repository?: unknown;
  type?: unknown;
  version?: unknown;
}

interface NpmPackResult {
  filename?: string;
}

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');
const RELEASE_PACKAGE_DIR = join(REPO_ROOT, '.tmp', 'release-package');
const RELEASE_DIST_BIN_DIR = join(RELEASE_PACKAGE_DIR, 'dist', 'bin');
const VERIFY_BINARY_NAME = `verify${executableExtension()}`;

function isPackageJsonShape(value: unknown): value is PackageJsonShape {
  return typeof value === 'object' && value !== null;
}

function isNpmPackResultArray(value: unknown): value is NpmPackResult[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'object' && entry !== null);
}

async function readPackageJson(): Promise<PackageJsonShape> {
  const parsed: unknown = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf-8'));
  if (!isPackageJsonShape(parsed)) {
    throw new Error('release: package.json must be an object');
  }
  return parsed;
}

async function buildVerifyBinary(): Promise<void> {
  await execa(
    'bun',
    ['build', '--compile', './bin/verify.ts', '--outfile', join(RELEASE_DIST_BIN_DIR, VERIFY_BINARY_NAME)],
    {
      cwd: REPO_ROOT,
      stdout: 'inherit',
      stderr: 'inherit',
    }
  );
}

async function writeReleasePackageJson(sourcePackageJson: PackageJsonShape): Promise<void> {
  const packageJson = {
    name: sourcePackageJson.name,
    version: sourcePackageJson.version,
    type: sourcePackageJson.type,
    description: sourcePackageJson.description,
    license: sourcePackageJson.license,
    author: sourcePackageJson.author,
    repository: sourcePackageJson.repository,
    homepage: sourcePackageJson.homepage,
    bugs: sourcePackageJson.bugs,
    keywords: sourcePackageJson.keywords,
    bin: {
      verify: `./dist/bin/${VERIFY_BINARY_NAME}`,
    },
    files: ['dist', 'README.md', 'LICENSE'],
  };
  await writeFile(join(RELEASE_PACKAGE_DIR, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf-8');
}

async function packReleasePackage(): Promise<void> {
  const result = await execa(
    'npm',
    [
      'pack',
      '--ignore-scripts',
      '--json',
      '--cache',
      join(REPO_ROOT, '.npm-cache'),
      '--pack-destination',
      ARTIFACTS_DIR,
    ],
    {
      cwd: RELEASE_PACKAGE_DIR,
      stdout: 'pipe',
      stderr: 'inherit',
    }
  );
  const parsed: unknown = JSON.parse(result.stdout);
  if (!isNpmPackResultArray(parsed) || typeof parsed[0]?.filename !== 'string') {
    throw new Error('release: npm pack returned an unexpected result');
  }
  const packedPath = join(ARTIFACTS_DIR, basename(parsed[0].filename));
  const releaseFileName = `agent-quality-gate-${sourceVersion(parsed[0].filename)}-${runtimePlatform()}.tgz`;
  const platformPath = join(ARTIFACTS_DIR, releaseFileName);
  await rename(packedPath, platformPath);
}

function sourceVersion(filename: string): string {
  const match = /^agent-quality-gate-(.+)\.tgz$/.exec(filename);
  if (!match?.[1]) {
    throw new Error(`release: unable to parse package version from "${filename}"`);
  }
  return match[1];
}

async function main(): Promise<void> {
  const packageJson = await readPackageJson();
  await rm(ARTIFACTS_DIR, { recursive: true, force: true });
  await rm(RELEASE_PACKAGE_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await mkdir(RELEASE_DIST_BIN_DIR, { recursive: true });
  await buildVerifyBinary();
  await cp(join(REPO_ROOT, 'README.md'), join(RELEASE_PACKAGE_DIR, 'README.md'));
  await cp(join(REPO_ROOT, 'LICENSE'), join(RELEASE_PACKAGE_DIR, 'LICENSE'));
  await writeReleasePackageJson(packageJson);
  await packReleasePackage();
}

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  await main();
}
