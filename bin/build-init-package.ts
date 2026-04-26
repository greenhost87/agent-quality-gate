#!/usr/bin/env bun

import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execa } from 'execa';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const INIT_PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'agent-quality-gate-init');
const INIT_DIST_DIR = join(INIT_PACKAGE_ROOT, 'dist');

async function main(): Promise<void> {
  await rm(INIT_DIST_DIR, { recursive: true, force: true });
  await mkdir(INIT_DIST_DIR, { recursive: true });
  await execa(
    'bun',
    [
      'build',
      './bin/agent-quality-gate-init.ts',
      '--target',
      'bun',
      '--format',
      'esm',
      '--outfile',
      './packages/agent-quality-gate-init/dist/bin/agent-quality-gate-init.js',
    ],
    {
      cwd: REPO_ROOT,
      stdout: 'inherit',
      stderr: 'inherit',
    }
  );
}

const shouldRunAsCli = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (shouldRunAsCli) {
  await main();
}
