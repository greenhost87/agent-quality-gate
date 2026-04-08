#!/usr/bin/env bun

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageJsonShape {
  version?: string;
}

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json');
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const TAG_PATTERN = /^v\d+\.\d+\.\d+$/;

function normalizeTag(input: string | undefined): string {
  if (!input) {
    throw new Error('release: missing tag value; pass tag as first argument or set GITHUB_REF_NAME');
  }
  if (input.startsWith('refs/tags/')) {
    return input.slice('refs/tags/'.length);
  }
  return input;
}

async function readPackageVersion(): Promise<string> {
  const raw = await readFile(PACKAGE_JSON_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as PackageJsonShape;
  if (!parsed.version || !VERSION_PATTERN.test(parsed.version)) {
    throw new Error(`release: invalid package.json version "${parsed.version ?? ''}"`);
  }
  return parsed.version;
}

async function main(): Promise<void> {
  const explicitTag = process.argv[2];
  const githubRefName = process.env.GITHUB_REF_NAME;
  const githubRef = process.env.GITHUB_REF;
  const tag = normalizeTag(explicitTag ?? githubRefName ?? githubRef);
  if (!TAG_PATTERN.test(tag)) {
    throw new Error(`release: tag "${tag}" must match vX.Y.Z`);
  }

  const version = await readPackageVersion();
  const expectedTag = `v${version}`;
  if (tag !== expectedTag) {
    throw new Error(`release: tag/version mismatch (tag=${tag}, package.json=${expectedTag}); keep them identical`);
  }

  process.stdout.write(`release: tag ${tag} matches package.json version ${version}\n`);
}

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  await main();
}
