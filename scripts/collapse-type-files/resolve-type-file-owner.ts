import { existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';

function existingPaths(candidates: readonly string[]): string[] {
  return candidates.filter((candidate) => existsSync(candidate));
}

function preferOne(paths: readonly string[]): string | null {
  return paths.length === 1 ? (paths[0] ?? null) : null;
}

function sameDirectoryImporters(typeFile: string, importers: readonly string[]): string[] {
  const directory = dirname(typeFile);
  return importers.filter((importer) => dirname(importer) === directory);
}

function basenameIs(path: string, name: string): boolean {
  return basename(path) === name;
}

/**
 * Owner priority:
 * 1. exact basename companion (`foo.ts` / `foo.tsx` / tests)
 * 2. fallow sole importer
 * 3. among importers, unique same-dir `route` / `page`
 * 4. among importers, unique `${basename}.helpers`
 * 5. among importers, unique same-dir `*.helpers`
 */
export function resolveTypeFileOwner(
  typeFile: string,
  importers: readonly string[],
): string | null {
  const base = typeFile.replace(/\.types\.tsx?$/u, '');
  const exact = existingPaths([`${base}.ts`, `${base}.tsx`, `${base}.test.ts`, `${base}.test.tsx`]);
  if (exact.length === 1) {
    return exact[0] ?? null;
  }
  if (exact.length > 1) {
    throw new Error(
      `${typeFile}: expected exactly one basename owner, found ${String(exact.length)}`,
    );
  }

  const sole = preferOne(importers);
  if (sole !== null) {
    return sole;
  }

  const sameDir = sameDirectoryImporters(typeFile, importers);
  const route =
    preferOne(sameDir.filter((path) => basenameIs(path, 'route.ts'))) ??
    preferOne(sameDir.filter((path) => basenameIs(path, 'route.tsx')));
  if (route !== null) {
    return route;
  }
  const page =
    preferOne(sameDir.filter((path) => basenameIs(path, 'page.ts'))) ??
    preferOne(sameDir.filter((path) => basenameIs(path, 'page.tsx')));
  if (page !== null) {
    return page;
  }

  const typeBase = basename(typeFile).replace(/\.types\.tsx?$/u, '');
  const namedHelpers = preferOne(
    importers.filter(
      (path) =>
        basenameIs(path, `${typeBase}.helpers.ts`) || basenameIs(path, `${typeBase}.helpers.tsx`),
    ),
  );
  if (namedHelpers !== null) {
    return namedHelpers;
  }

  return preferOne(
    sameDir.filter((path) => {
      const name = basename(path);
      return name.endsWith('.helpers.ts') || name.endsWith('.helpers.tsx');
    }),
  );
}
