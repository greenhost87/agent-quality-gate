import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';

import { loadImportFanIn } from './load-import-fan-in.js';
import {
  importInsertionOffset,
  mergedImports,
  parseSource,
  removeImports,
  rewriteTypeReferences,
} from './merge-type-file-imports.js';
import { resolveTypeFileOwner } from './resolve-type-file-owner.js';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

type CollapsePair = {
  typeFile: string;
  owner: string;
};

export type CollapseTypeFilesResult = {
  pairs: number;
  skippedFiles: string[];
  changedFiles: number;
  dryRun: boolean;
};

export type CollapseTypeFilesOptions = {
  dryRun?: boolean;
  /** Absolute path → absolute importer paths. When omitted, runs fallow viz. */
  importFanIn?: ReadonlyMap<string, readonly string[]>;
};

function collectSourceFiles(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
        collectSourceFiles(join(directory, entry.name), files);
      }
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(path))) {
      files.push(path);
    }
  }
}

function collapsePairs(
  sourceFiles: readonly string[],
  importFanIn: ReadonlyMap<string, readonly string[]>,
): { pairs: CollapsePair[]; skipped: string[] } {
  const pairs: CollapsePair[] = [];
  const skipped: string[] = [];
  for (const typeFile of sourceFiles.filter((path) => /\.types\.tsx?$/u.test(path)).sort()) {
    const owner = resolveTypeFileOwner(typeFile, importFanIn.get(typeFile) ?? []);
    if (owner === null) {
      skipped.push(typeFile);
      continue;
    }
    pairs.push({ typeFile, owner });
  }
  return { pairs, skipped };
}

function groupTypeFilesByOwner(pairs: readonly CollapsePair[]): Map<string, string[]> {
  const typeFilesByOwner = new Map<string, string[]>();
  for (const pair of pairs) {
    const owned = typeFilesByOwner.get(pair.owner) ?? [];
    owned.push(pair.typeFile);
    typeFilesByOwner.set(pair.owner, owned);
  }
  return typeFilesByOwner;
}

function buildChangedOutputs(
  root: string,
  sourceFiles: readonly string[],
  typeFiles: ReadonlySet<string>,
  ownersByTypeFile: ReadonlyMap<string, string>,
  ownerOutputs: ReadonlyMap<string, string>,
): Map<string, string> {
  const outputs = new Map<string, string>();
  for (const path of sourceFiles) {
    if (typeFiles.has(path)) {
      continue;
    }
    const original = readFileSync(path, 'utf8');
    const rewritten = rewriteTypeReferences(
      path,
      ownerOutputs.get(path) ?? original,
      ownersByTypeFile,
      root,
    );
    parseSource(path, rewritten);
    if (rewritten !== original) {
      outputs.set(path, rewritten);
    }
  }
  return outputs;
}

function applyCollapseWrites(
  outputs: ReadonlyMap<string, string>,
  typeFiles: ReadonlySet<string>,
): void {
  for (const [path, code] of outputs) {
    writeFileSync(path, code);
  }
  for (const typeFile of typeFiles) {
    rmSync(typeFile);
  }
}

function mergeTypeFilesIntoOwner(
  owner: string,
  typeFiles: readonly string[],
  ownersByTypeFile: ReadonlyMap<string, string>,
  projectRoot: string,
): string {
  let ownerCode = rewriteTypeReferences(
    owner,
    readFileSync(owner, 'utf8'),
    ownersByTypeFile,
    projectRoot,
  );
  for (const typeFile of typeFiles) {
    const extracted = removeImports(typeFile, readFileSync(typeFile, 'utf8'));
    const merged = mergedImports(owner, ownerCode, extracted.imports);
    const uniqueImports = merged.imports.filter(
      (statement, index, imports) => imports.indexOf(statement) === index,
    );
    const offset = importInsertionOffset(owner, merged.owner);
    const mergedStatements = [...uniqueImports, extracted.body]
      .filter((statement) => statement.length > 0)
      .join('\n\n');
    const block = mergedStatements.length > 0 ? `\n${mergedStatements}\n` : '';
    ownerCode = `${merged.owner.slice(0, offset)}${block}${merged.owner.slice(offset)}`;
  }
  return ownerCode;
}

export async function collapseTypeFiles(
  projectRoot: string,
  options: CollapseTypeFilesOptions = {},
): Promise<CollapseTypeFilesResult> {
  const root = resolve(projectRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`not a directory: ${root}`);
  }
  const sourceFiles: string[] = [];
  collectSourceFiles(root, sourceFiles);
  const importFanIn = options.importFanIn ?? (await loadImportFanIn(root));
  const { pairs, skipped } = collapsePairs(sourceFiles, importFanIn);
  const ownersByTypeFile = new Map(pairs.map((pair) => [pair.typeFile, pair.owner]));
  const typeFiles = new Set(ownersByTypeFile.keys());
  const ownerOutputs = new Map(
    [...groupTypeFilesByOwner(pairs).entries()].map(([owner, ownedTypeFiles]) => [
      owner,
      mergeTypeFilesIntoOwner(owner, ownedTypeFiles, ownersByTypeFile, root),
    ]),
  );
  const outputs = buildChangedOutputs(root, sourceFiles, typeFiles, ownersByTypeFile, ownerOutputs);
  const dryRun = options.dryRun === true;
  if (!dryRun) {
    applyCollapseWrites(outputs, typeFiles);
  }
  return {
    pairs: pairs.length,
    skippedFiles: skipped.map((path) => relative(root, path).split(sep).join('/')),
    changedFiles: outputs.size,
    dryRun,
  };
}
