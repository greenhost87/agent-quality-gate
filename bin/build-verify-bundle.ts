#!/usr/bin/env bun

import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

interface PackageJsonShape {
  version?: string;
}

interface BundledAsset {
  sourcePath: string;
  outputPath: string;
  kind: 'file' | 'directory';
}

interface BundledManifestFile {
  file: string;
  sha256: string;
  size: number;
}

interface BundledManifest {
  version: string;
  builtAt: string;
  files: BundledManifestFile[];
}

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST_DIR = join(REPO_ROOT, 'dist');
const DIST_DEFAULT_CONFIGS_DIR = join(DIST_DIR, 'default-configs');
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json');

const BUNDLED_ASSETS: BundledAsset[] = [
  { sourcePath: 'eslint.config.mjs', outputPath: 'eslint.config.mjs', kind: 'file' },
  { sourcePath: 'eslint-length.config.mjs', outputPath: 'eslint-length.config.mjs', kind: 'file' },
  { sourcePath: 'tsconfig.verify.json', outputPath: 'tsconfig.verify.json', kind: 'file' },
  { sourcePath: 'knip.json', outputPath: 'knip.json', kind: 'file' },
  { sourcePath: '.jscpd.json', outputPath: '.jscpd.json', kind: 'file' },
  { sourcePath: '.dependency-cruiser.cjs', outputPath: '.dependency-cruiser.cjs', kind: 'file' },
  {
    sourcePath: 'tools/eslint-plugin-quality',
    outputPath: 'tools/eslint-plugin-quality',
    kind: 'directory',
  },
  {
    sourcePath: 'tools/analyze',
    outputPath: 'tools/analyze',
    kind: 'directory',
  },
];

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function isPackageJsonShape(value: unknown): value is PackageJsonShape {
  return typeof value === 'object' && value !== null && (!('version' in value) || typeof value.version === 'string');
}

async function readVersion(): Promise<string> {
  const raw = await readFile(PACKAGE_JSON_PATH, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!isPackageJsonShape(parsed)) {
    return '0.0.0-local';
  }
  if (typeof parsed.version === 'string' && parsed.version.trim().length > 0) {
    return parsed.version;
  }
  return '0.0.0-local';
}

async function buildRuntime(): Promise<void> {
  const args = [
    'build',
    './bin/verify.ts',
    './bin/verify-protected-coverage.ts',
    './bin/verify-markdown-headings.ts',
    './src/verify/index.ts',
    '--target',
    'bun',
    '--format',
    'esm',
    '--outdir',
    './dist',
  ];
  await execa('bun', args, {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

async function listFilesRecursively(directoryPath: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(fullPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function copyBundledConfigs(version: string): Promise<void> {
  await mkdir(DIST_DEFAULT_CONFIGS_DIR, { recursive: true });
  const files: BundledManifestFile[] = [];

  for (const asset of BUNDLED_ASSETS) {
    const sourcePath = join(REPO_ROOT, asset.sourcePath);
    const outputPath = join(DIST_DEFAULT_CONFIGS_DIR, asset.outputPath);

    if (asset.kind === 'file') {
      await mkdir(dirname(outputPath), { recursive: true });
      await copyFile(sourcePath, outputPath);
    } else {
      await mkdir(dirname(outputPath), { recursive: true });
      await cp(sourcePath, outputPath, { recursive: true });
    }

    const copiedPaths = asset.kind === 'file' ? [outputPath] : await listFilesRecursively(outputPath);
    for (const copiedPath of copiedPaths) {
      const relativeFilePath = normalizePath(relative(DIST_DEFAULT_CONFIGS_DIR, copiedPath));
      const content = await readFile(copiedPath, 'utf-8');
      const fileStat = await stat(copiedPath);
      files.push({
        file: relativeFilePath,
        sha256: hashContent(content),
        size: fileStat.size,
      });
    }
  }
  files.sort((left, right) => left.file.localeCompare(right.file));

  const manifest: BundledManifest = {
    version,
    builtAt: new Date().toISOString(),
    files,
  };
  await writeFile(join(DIST_DEFAULT_CONFIGS_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
}

async function main(): Promise<void> {
  const version = await readVersion();
  await rm(DIST_DIR, { force: true, recursive: true });
  await mkdir(DIST_DIR, { recursive: true });
  await buildRuntime();
  await copyBundledConfigs(version);
}

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  await main();
}
