import { copyFileSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Stats } from 'node:fs';
import { write } from 'bun';

import { pathExists, readBytesFileSync } from '../../process/files/files.js';
import { contentHash } from '../manifest/content-hash.js';
import type {
  ManagedFileMismatch,
  PresetManagedFilesResult,
  ResolvedManagedFile,
} from '../contract/preset-contract.types.js';

function isInsideProject(projectRoot: string, destinationAbsolute: string): boolean {
  const relativePath = relative(projectRoot, destinationAbsolute);
  return (
    relativePath.length > 0 && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath)
  );
}

function assertSafeDestination(projectRoot: string, destination: string): string | undefined {
  if (destination.length === 0 || isAbsolute(destination) || destination.includes('\0')) {
    return `unsafe preset destination "${destination}"`;
  }
  const normalized = destination.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part === '..' || part === '')) {
    return `unsafe preset destination "${destination}"`;
  }
  const absolute = resolve(projectRoot, destination);
  if (!isInsideProject(projectRoot, absolute)) {
    return `unsafe preset destination "${destination}"`;
  }
  return undefined;
}

async function writeAtomically(destinationAbsolute: string, contents: Uint8Array): Promise<void> {
  const directory = dirname(destinationAbsolute);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = join(
    directory,
    `.aqg-preset-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    await write(temporaryPath, contents);
    try {
      renameSync(temporaryPath, destinationAbsolute);
    } catch {
      copyFileSync(temporaryPath, destinationAbsolute);
      rmSync(temporaryPath, { force: true });
    }
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
}

function inspectDestination(
  destination: string,
  destinationAbsolute: string,
): { stats: Stats } | { error: string } {
  try {
    return { stats: lstatSync(destinationAbsolute) };
  } catch {
    return { error: `unable to inspect preset destination ${destination}` };
  }
}

function refuseExistingDestination(stats: Stats, destination: string): string | undefined {
  if (stats.isSymbolicLink()) {
    return `refusing managed symlink destination ${destination}`;
  }
  if (!stats.isFile()) {
    return `refusing managed non-file destination ${destination}`;
  }
  return undefined;
}

function isProjectPathOrDescendant(projectAbsolute: string, candidate: string): boolean {
  return candidate === projectAbsolute || candidate.startsWith(`${projectAbsolute}${sep}`);
}

function refuseUnsafeParents(projectRoot: string, destinationAbsolute: string): string | undefined {
  let cursor = dirname(destinationAbsolute);
  const projectAbsolute = resolve(projectRoot);
  while (isProjectPathOrDescendant(projectAbsolute, cursor)) {
    if (existsSync(cursor)) {
      const stats = lstatSync(cursor);
      if (stats.isSymbolicLink()) {
        return `refusing to write through symlink parent for ${relative(projectRoot, destinationAbsolute)}`;
      }
      if (!stats.isDirectory()) {
        return `refusing to create file under non-directory for ${relative(projectRoot, destinationAbsolute)}`;
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }
    cursor = parent;
  }
  return undefined;
}

function exampleRelativePath(presetName: string, destination: string): string {
  return `.aqg/${presetName}/${destination}`;
}

async function resolveExpectedHash(
  file: ResolvedManagedFile,
): Promise<{ expectedHash: string } | { error: string }> {
  if (file.contentHash !== undefined) {
    return { expectedHash: file.contentHash };
  }
  if (!(await pathExists(file.absoluteSource))) {
    return { error: `missing preset source ${file.absoluteSource}` };
  }
  return { expectedHash: contentHash(readBytesFileSync(file.absoluteSource)) };
}

async function refreshExample(
  projectRoot: string,
  file: ResolvedManagedFile,
  expectedHash: string,
  examplePath: string,
): Promise<string | undefined> {
  const exampleAbsolute = resolve(projectRoot, examplePath);
  if (await pathExists(exampleAbsolute)) {
    if (contentHash(readBytesFileSync(exampleAbsolute)) === expectedHash) {
      return undefined;
    }
  }
  if (!(await pathExists(file.absoluteSource))) {
    return `missing preset source ${file.absoluteSource}`;
  }
  const sourceBytes = readBytesFileSync(file.absoluteSource);
  if (contentHash(sourceBytes) !== expectedHash) {
    return `preset source hash mismatch for ${file.destination}`;
  }
  await writeAtomically(exampleAbsolute, sourceBytes);
  return undefined;
}

async function checkOneFile(
  projectRoot: string,
  file: ResolvedManagedFile,
): Promise<ManagedFileMismatch | { error: string } | undefined> {
  const unsafe = assertSafeDestination(projectRoot, file.destination);
  if (unsafe !== undefined) {
    return { error: unsafe };
  }

  const destinationAbsolute = resolve(projectRoot, file.destination);
  const parentError = refuseUnsafeParents(projectRoot, destinationAbsolute);
  if (parentError !== undefined) {
    return { error: parentError };
  }

  const expected = await resolveExpectedHash(file);
  if ('error' in expected) {
    return expected;
  }
  const { expectedHash } = expected;
  const examplePath = exampleRelativePath(file.presetName, file.destination);
  const exampleError = await refreshExample(projectRoot, file, expectedHash, examplePath);
  if (exampleError !== undefined) {
    return { error: exampleError };
  }

  if (file.exampleOnly === true) {
    return undefined;
  }

  if (!(await pathExists(destinationAbsolute))) {
    return {
      destination: file.destination,
      presetName: file.presetName,
      reason: 'missing',
      examplePath,
    };
  }

  const inspected = inspectDestination(file.destination, destinationAbsolute);
  if ('error' in inspected) {
    return inspected;
  }
  const refusal = refuseExistingDestination(inspected.stats, file.destination);
  if (refusal !== undefined) {
    return { error: refusal };
  }

  if (contentHash(readBytesFileSync(destinationAbsolute)) === expectedHash) {
    return undefined;
  }
  return {
    destination: file.destination,
    presetName: file.presetName,
    reason: 'modified',
    examplePath,
  };
}

/** Compare managed destinations to preset content hashes. Never writes destinations; refreshes examples under `.aqg/<preset>/`. */
export async function verifyManagedPresetFiles(
  projectRoot: string,
  files: readonly ResolvedManagedFile[],
): Promise<PresetManagedFilesResult> {
  const mismatches: ManagedFileMismatch[] = [];

  for (const file of files) {
    const result = await checkOneFile(projectRoot, file);
    if (result === undefined) {
      continue;
    }
    if ('error' in result) {
      return { ok: false, error: result.error };
    }
    mismatches.push(result);
  }

  return { ok: true, mismatches };
}

export function formatManagedFileMismatches(mismatches: readonly ManagedFileMismatch[]): string {
  return mismatches
    .map(
      (mismatch) => `${mismatch.destination} (${mismatch.reason}); example ${mismatch.examplePath}`,
    )
    .join('\n');
}
