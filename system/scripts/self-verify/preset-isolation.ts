import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { readTextFileSync } from '#system/process/files/files.js';
import { formatPrefixedViolations } from '#system/gate/run/format-prefixed-violations.js';
import {
  collectRepositoryFiles,
  isInsideProject,
  listPresetPackageNames,
  resolveProjectRoot,
  toProjectRelativePath,
} from './repo-walk.js';

const PRESETS_DIRECTORY = 'presets';
const ALLOWED_AQG_IMPORTS = new Set([
  'agent-quality-gate/shared/verify',
  'agent-quality-gate/shared/oxlint',
  'agent-quality-gate/testing/oxlint',
]);
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

function isAllowedInternalPresetImport(
  projectRoot: string,
  presetName: string,
  specifier: string,
): boolean {
  const prefix = 'agent-quality-gate/internal/';
  if (!specifier.startsWith(prefix)) {
    return false;
  }
  const target = resolveImportTarget(
    join(projectRoot, 'package.json'),
    `./${specifier.slice(prefix.length)}`,
  );
  if (target === undefined || !isInsideProject(projectRoot, target)) {
    return false;
  }
  const segments = relative(projectRoot, target).split(sep);
  return segments[0] === 'presets' && (segments[1] === presetName || segments[1] === '_shared');
}

function isForbiddenPresetImport(
  projectRoot: string,
  presetName: string,
  specifier: string,
  resolved: string | undefined,
): boolean {
  if (specifier.startsWith('agent-quality-gate/')) {
    return (
      !ALLOWED_AQG_IMPORTS.has(specifier) &&
      !isAllowedInternalPresetImport(projectRoot, presetName, specifier)
    );
  }
  if (resolved === undefined || !isInsideProject(projectRoot, resolved)) {
    return false;
  }
  const segments = relative(projectRoot, resolved).split(sep);
  if (segments[0] === 'presets' && segments[1] === '_shared') {
    return false;
  }
  if (segments[0] === 'system') {
    return true;
  }
  const importedPreset = presetNameForPath(projectRoot, resolved);
  return importedPreset !== undefined && importedPreset !== presetName;
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
        if (!isForbiddenPresetImport(root, presetName, specifier, resolved)) {
          continue;
        }
        violations.push({
          importer: toProjectRelativePath(root, sourceFile),
          imported: resolved === undefined ? specifier : toProjectRelativePath(root, resolved),
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
  const check = formatPrefixedViolations(
    'preset-isolation',
    violations.map(
      (violation) =>
        `${violation.importer}: imports ${violation.imported} via ${JSON.stringify(violation.specifier)}`,
    ),
  );
  if (check.exitCode === 0) {
    return { exitCode: 0, stdout: '', stderr: '' };
  }
  return {
    exitCode: check.exitCode,
    stdout: '',
    stderr: `${check.diagnostics
      .map((diagnostic) => {
        const path = diagnostic.location?.path;
        const ruleId = diagnostic.ruleId ?? 'unknown';
        return path === undefined
          ? `${ruleId}:${diagnostic.message}`
          : `${ruleId}:${path}: ${diagnostic.message}`;
      })
      .join('\n')}\n`,
  };
}

export type CrossPresetImportViolation = {
  importer: string;
  imported: string;
  specifier: string;
};
