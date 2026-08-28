import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { readTextFileSync } from '../../process/files/files.js';
import {
  collectRepositoryFiles,
  formatPrefixedViolations,
  isInsideProject,
  listPresetPackageNames,
  resolveProjectRoot,
  toProjectRelativePath,
} from './repo-walk.js';

const PRESETS_DIRECTORY = 'presets';
const IMPORT_SPECIFIER_PATTERN =
  /(?:\bimport\s*(?:type\s+)?(?:[^"'()]*?\s+from\s*)?|\bexport\s+(?:type\s+)?[^"'()]*?\s+from\s*|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/gu;

function presetNameForPath(projectRoot: string, absolutePath: string): string | undefined {
  if (!isInsideProject(projectRoot, absolutePath)) {
    return undefined;
  }
  const segments = relative(projectRoot, absolutePath).split(sep);
  if (segments[0] !== PRESETS_DIRECTORY || segments.length < 2) {
    return undefined;
  }
  return segments[1];
}

function collectImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
    const specifier = match[1];
    if (specifier !== undefined && specifier.length > 0) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function resolveImportTarget(importerAbsolutePath: string, specifier: string): string | undefined {
  if (specifier.startsWith('node:')) {
    return undefined;
  }
  if (!(specifier.startsWith('.') || specifier.startsWith('/') || isAbsolute(specifier))) {
    return undefined;
  }
  const base = resolve(dirname(importerAbsolutePath), specifier);
  const withoutExt = base.replace(/\.(?:[cm]?js|jsx|ts|tsx)$/u, '');
  const candidates = [
    base,
    withoutExt,
    `${withoutExt}.ts`,
    `${withoutExt}.tsx`,
    `${withoutExt}.js`,
    `${withoutExt}.jsx`,
    `${withoutExt}.mjs`,
    `${withoutExt}.cjs`,
    join(withoutExt, 'index.ts'),
    join(withoutExt, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return withoutExt;
}

function findCrossPresetImports(projectRoot: string): CrossPresetImportViolation[] {
  const root = resolveProjectRoot(projectRoot);
  const presetsRoot = join(root, PRESETS_DIRECTORY);
  const presetNames = listPresetPackageNames(presetsRoot);
  const violations: CrossPresetImportViolation[] = [];

  for (const presetName of presetNames) {
    const presetRoot = join(presetsRoot, presetName);
    const sourceFiles: string[] = [];
    collectRepositoryFiles(presetRoot, sourceFiles, { sourceExtensionsOnly: true });
    for (const sourceFile of sourceFiles) {
      const content = readTextFileSync(sourceFile);
      for (const specifier of collectImportSpecifiers(content)) {
        const resolved = resolveImportTarget(sourceFile, specifier);
        if (resolved === undefined) {
          continue;
        }
        const importedPreset = presetNameForPath(root, resolved);
        if (importedPreset === undefined || importedPreset === presetName) {
          continue;
        }
        violations.push({
          importer: toProjectRelativePath(root, sourceFile),
          imported: toProjectRelativePath(root, resolved),
          specifier,
        });
      }
    }
  }

  violations.sort((left, right) => {
    const importerOrder = left.importer.localeCompare(right.importer);
    if (importerOrder !== 0) {
      return importerOrder;
    }
    return left.imported.localeCompare(right.imported);
  });
  return violations;
}

export function rejectCrossPresetImports(projectRoot: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const violations = findCrossPresetImports(projectRoot);
  return formatPrefixedViolations(
    'preset-isolation',
    violations.map(
      (violation) =>
        `${violation.importer}: imports ${violation.imported} via ${JSON.stringify(violation.specifier)}`,
    ),
  );
}

export type CrossPresetImportViolation = {
  importer: string;
  imported: string;
  specifier: string;
};
