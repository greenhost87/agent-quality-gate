#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import {
  agentQualityGateHome,
  homeInstalledPresetRoot,
  homePresetsDirectory,
} from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { isKnownPresetName } from '../../preset-catalog/catalog/preset-catalog.js';
import { packagePresetRoot } from '../package-preset-root/package-preset-root.js';

function resolveBundleCwd(sourceRoot: string): string {
  const parent = dirname(sourceRoot);
  if (existsSync(join(parent, 'package.json'))) {
    return parent;
  }
  return sourceRoot;
}

function installNodeModulesDirectory(home: string): string {
  return join(home, 'install', 'node_modules');
}

/** Oxlint JS plugins keep `@oxlint/plugins` external; share the gate install graph. */
async function linkPresetNodeModulesToInstall(
  destinationRoot: string,
  home: string,
): Promise<void> {
  const installModules = installNodeModulesDirectory(home);
  if (!existsSync(installModules)) {
    throw new Error(
      `agent-quality-gate install node_modules not found at ${installModules}; install agent-quality-gate before optional presets`,
    );
  }
  const linkPath = join(destinationRoot, 'node_modules');
  await rm(linkPath, { recursive: true, force: true });
  await symlink(relative(destinationRoot, installModules), linkPath, 'dir');
}

export async function installPresetFromSource(
  sourceRootInput: string,
  home = agentQualityGateHome(),
): Promise<string> {
  const sourceRoot = resolve(sourceRootInput);
  if (!existsSync(join(sourceRoot, 'manifest.json'))) {
    throw new Error(`preset root ${sourceRoot} must contain manifest.json`);
  }
  const stagingParent = await mkdtemp(join(tmpdir(), 'aqg-install-preset-'));
  const stagingRoot = join(stagingParent, 'preset');
  try {
    const { name } = await packagePresetRoot({
      sourceRoot,
      destinationRoot: stagingRoot,
      bundleCwd: resolveBundleCwd(sourceRoot),
    });
    if (isKnownPresetName(name)) {
      throw new Error(
        `preset "${name}" is shipped with agent-quality-gate and cannot be installed under home`,
      );
    }
    const destinationRoot = homeInstalledPresetRoot(name, home);
    await mkdir(homePresetsDirectory(home), { recursive: true });
    await rm(destinationRoot, { recursive: true, force: true });
    await cp(stagingRoot, destinationRoot, { recursive: true });
    await linkPresetNodeModulesToInstall(destinationRoot, home);
    return destinationRoot;
  } finally {
    await rm(stagingParent, { recursive: true, force: true });
  }
}

function usage(): never {
  throw new Error(
    'usage: bun ./scripts/install-preset/install-preset.ts <absolute-preset-source-root>',
  );
}

async function main(): Promise<void> {
  const sourceRoot = process.argv[2];
  if (sourceRoot === undefined || sourceRoot.length === 0) {
    usage();
  }
  if (!isAbsolute(sourceRoot)) {
    throw new Error(`preset source root must be absolute: ${sourceRoot}`);
  }
  const destination = await installPresetFromSource(sourceRoot);
  process.stdout.write(`${destination}\n`);
}

if (import.meta.main) {
  await main();
}
