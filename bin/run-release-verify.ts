#!/usr/bin/env bun

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnCommand } from '../src/verify/spawn.js';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const VERIFY_LAUNCHER_PATH = join(REPO_ROOT, '.tmp', 'release-package', 'dist', 'bin', 'verify.js');

async function main(): Promise<number> {
  const build = await spawnCommand('bun', ['./bin/build-release-package.ts'], REPO_ROOT, true);
  if (build.exitCode !== 0) {
    return build.exitCode;
  }
  const verify = await spawnCommand('node', [VERIFY_LAUNCHER_PATH, ...process.argv.slice(2)], REPO_ROOT, true);
  return verify.exitCode;
}

if (import.meta.main) {
  process.exitCode = await main();
}
