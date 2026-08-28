#!/usr/bin/env bun

import { file, write } from 'bun';
import { join, resolve } from 'node:path';
import * as v from 'valibot';

import { createCli, parseCli, reportCommandError } from '../../process/command/command.js';
import { readJsonFile } from '../../process/files/files.js';
import { resolveProjectRoot } from '../self-verify/repo-walk.js';

const SEMVER = /^\d+\.\d+\.\d+$/;

const VERSION_NEEDLES: readonly VersionNeedle[] = [
  {
    relativePath: 'package.json',
    needle: (fromVersion) => `"version": "${fromVersion}"`,
    replacement: (toVersion) => `"version": "${toVersion}"`,
  },
  {
    relativePath: 'README.md',
    needle: (fromVersion) => `bun ./install.ts --version ${fromVersion}`,
    replacement: (toVersion) => `bun ./install.ts --version ${toVersion}`,
  },
  {
    relativePath: 'scripts/install-local/parse-install-args.ts',
    needle: (fromVersion) => `Install a specific release (e.g. ${fromVersion}); default: latest`,
    replacement: (toVersion) => `Install a specific release (e.g. ${toVersion}); default: latest`,
  },
];

function replaceNeedle(
  content: string,
  relativePath: string,
  needle: string,
  replacement: string,
): string {
  if (!content.includes(needle)) {
    throw new Error(`${relativePath} missing ${needle}`);
  }
  return content.replace(needle, replacement);
}

export const VERSION_SURFACES: readonly VersionSurface[] = VERSION_NEEDLES.map((versionedFile) => ({
  relativePath: versionedFile.relativePath,
  replace: (content, fromVersion, toVersion) =>
    replaceNeedle(
      content,
      versionedFile.relativePath,
      versionedFile.needle(fromVersion),
      versionedFile.replacement(toVersion),
    ),
}));

export function parseBumpVersionArgs(
  argv: readonly string[],
  defaultCwd: string = process.cwd(),
): ParseBumpVersionArgsResult {
  const program = createCli('bump-version')
    .argument('<version>', 'Target release version (X.Y.Z)')
    .option('--cwd <path>', 'Project root', defaultCwd);
  if (parseCli(program, argv) === 'help') {
    return 'help';
  }

  const version = program.args[0];
  if (version === undefined) {
    throw new Error('missing version (expected X.Y.Z)');
  }
  if (!SEMVER.test(version)) {
    throw new Error(`invalid version "${version}" (expected X.Y.Z)`);
  }

  return {
    version,
    cwd: resolve(program.opts<{ cwd: string }>().cwd),
  };
}

export const BUMP_VERSION_USAGE = `Usage: bun run bump-version -- <X.Y.Z> [--cwd <path>]

Update user-facing release version pins:

  package.json
  README.md install example
  scripts/install-local/parse-install-args.ts help example

  <X.Y.Z>       Target release version
  --cwd <path>  Project root (defaults to the current working directory)
  -h, --help    Show this help

`;

export function printBumpVersionUsage(): void {
  process.stdout.write(BUMP_VERSION_USAGE);
}

export async function readPackageVersion(projectRoot: string): Promise<string> {
  const packagePath = join(projectRoot, 'package.json');
  const PackageVersionSchema = v.looseObject({
    version: v.optional(v.unknown()),
  });
  const parsed = await readJsonFile(packagePath, PackageVersionSchema);
  const version = parsed.version;
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error(`${packagePath} has invalid version`);
  }
  return version;
}

export async function bumpVersion(projectRoot: string, toVersion: string): Promise<string[]> {
  const root = resolveProjectRoot(projectRoot);
  const fromVersion = await readPackageVersion(root);
  if (fromVersion === toVersion) {
    throw new Error(`version is already ${toVersion}`);
  }

  const updated: string[] = [];
  for (const surface of VERSION_SURFACES) {
    const absolutePath = join(root, surface.relativePath);
    const before = await file(absolutePath).text();
    const after = surface.replace(before, fromVersion, toVersion);
    if (after === before) {
      throw new Error(`${surface.relativePath} did not change`);
    }
    await write(absolutePath, after);
    updated.push(surface.relativePath);
  }
  return updated;
}

if (import.meta.main) {
  try {
    const parsed = parseBumpVersionArgs(process.argv.slice(2));
    if (parsed === 'help') {
      printBumpVersionUsage();
    } else {
      const updated = await bumpVersion(parsed.cwd, parsed.version);
      process.stdout.write(`bumped version to ${parsed.version}\n`);
      for (const relativePath of updated) {
        process.stdout.write(`  ${relativePath}\n`);
      }
    }
  } catch (error) {
    reportCommandError('bump-version', error instanceof Error ? error : String(error));
    process.exitCode = 2;
  }
}

export type BumpVersionArgs = {
  version: string;
  cwd: string;
};

export type ParseBumpVersionArgsResult = BumpVersionArgs | 'help';

export type VersionSurface = {
  relativePath: string;
  replace: (content: string, fromVersion: string, toVersion: string) => string;
};

export type VersionNeedle = {
  relativePath: string;
  needle: (fromVersion: string) => string;
  replacement: (toVersion: string) => string;
};
