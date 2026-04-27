#!/usr/bin/env bun

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

import { executableExtension } from '../src/runtime/paths.js';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const VERIFY_BINARY_PATH = join(REPO_ROOT, '.tmp', 'release-package', 'dist', 'bin', `verify${executableExtension()}`);

async function main(): Promise<number> {
  await execa('bun', ['./bin/build-release-package.ts'], {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const result = await execa(VERIFY_BINARY_PATH, process.argv.slice(2), {
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0' },
    reject: false,
    stderr: 'inherit',
    stdout: 'inherit',
  });
  return result.exitCode ?? 1;
}

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  process.exitCode = await main();
}
