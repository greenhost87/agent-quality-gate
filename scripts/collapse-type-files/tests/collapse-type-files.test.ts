import { describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  COLLAPSE_TYPE_FILES_USAGE,
  parseCollapseTypeFilesArgs,
} from '../parse-collapse-type-files-args.ts';
import { collapseTypeFiles } from '../collapse-type-files.ts';
import { resolveTypeFileOwner } from '../resolve-type-file-owner.ts';

const DEFAULT_CWD = '/tmp/aqg-collapse-types-default';

function fixture(): string {
  return mkdtempSync(join(tmpdir(), 'collapse-type-files-'));
}

function write(path: string, code: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, code);
}

function fanIn(
  root: string,
  entries: Readonly<Record<string, readonly string[]>>,
): Map<string, string[]> {
  return new Map(
    Object.entries(entries).map(([typeFile, importers]) => [
      join(root, typeFile),
      importers.map((importer) => join(root, importer)),
    ]),
  );
}

describe('parseCollapseTypeFilesArgs', () => {
  it('defaults to the provided cwd without write flags', () => {
    expect(parseCollapseTypeFilesArgs([], DEFAULT_CWD)).toEqual({
      cwd: DEFAULT_CWD,
      dryRun: false,
    });
  });

  it('resolves --cwd relative to the process working directory', () => {
    expect(parseCollapseTypeFilesArgs(['--cwd', '.'], DEFAULT_CWD)).toEqual({
      cwd: resolve('.'),
      dryRun: false,
    });
  });

  it('accepts --dry-run with --cwd', () => {
    expect(parseCollapseTypeFilesArgs(['--cwd', '/tmp/target', '--dry-run'], DEFAULT_CWD)).toEqual({
      cwd: resolve('/tmp/target'),
      dryRun: true,
    });
  });

  it('returns help for -h and --help', () => {
    expect(parseCollapseTypeFilesArgs(['-h'], DEFAULT_CWD)).toBe('help');
    expect(parseCollapseTypeFilesArgs(['--help'], DEFAULT_CWD)).toBe('help');
  });

  it('documents --cwd and --dry-run', () => {
    expect(COLLAPSE_TYPE_FILES_USAGE).toContain('--cwd');
    expect(COLLAPSE_TYPE_FILES_USAGE).toContain('--dry-run');
    expect(COLLAPSE_TYPE_FILES_USAGE).not.toContain('--ignore-ownerless');
  });

  it('rejects unknown flags and positionals', () => {
    expect(() => parseCollapseTypeFilesArgs(['--update'], DEFAULT_CWD)).toThrow();
    expect(() => parseCollapseTypeFilesArgs(['extra'], DEFAULT_CWD)).toThrow(/unexpected argument/);
  });
});

describe('resolveTypeFileOwner', () => {
  it('prefers an exact basename owner over importers', () => {
    const root = fixture();
    const typeFile = join(root, 'feature.types.ts');
    const owner = join(root, 'feature.ts');
    write(typeFile, 'export type Feature = string;');
    write(owner, 'export {};');
    write(join(root, 'route.ts'), 'export {};');
    expect(resolveTypeFileOwner(typeFile, [join(root, 'route.ts')])).toBe(owner);
  });

  it('uses a sole fallow importer when no basename owner exists', () => {
    const root = fixture();
    const typeFile = join(root, 'orphan.types.ts');
    const importer = join(root, 'only-consumer.ts');
    write(typeFile, 'export type Orphan = string;');
    write(importer, 'export {};');
    expect(resolveTypeFileOwner(typeFile, [importer])).toBe(importer);
  });

  it('prefers same-dir route among multiple importers', () => {
    const root = fixture();
    const typeFile = join(root, 'api', 'mailing-api.types.ts');
    const route = join(root, 'api', 'route.ts');
    const helpers = join(root, 'api', 'mailing-api.helpers.ts');
    write(typeFile, 'export type Ctx = {};');
    write(route, 'export {};');
    write(helpers, 'export {};');
    expect(resolveTypeFileOwner(typeFile, [helpers, route])).toBe(route);
  });

  it('prefers basename helpers when route is not an importer', () => {
    const root = fixture();
    const typeFile = join(root, 'api', 'mailing-api.types.ts');
    const helpers = join(root, 'api', 'mailing-api.helpers.ts');
    const otherHelpers = join(root, 'api', 'other.helpers.ts');
    write(typeFile, 'export type Ctx = {};');
    write(helpers, 'export {};');
    write(otherHelpers, 'export {};');
    expect(resolveTypeFileOwner(typeFile, [helpers, otherHelpers])).toBe(helpers);
  });
});

describe('collapseTypeFiles', () => {
  it('moves types into basename owners and redirects importers', async () => {
    const root = fixture();
    write(join(root, 'dependency.ts'), 'export type Dependency = number;');
    write(
      join(root, 'feature.types.ts'),
      "import type { Dependency } from './dependency.js'; export type Feature = { dependency: Dependency };",
    );
    write(
      join(root, 'feature.ts'),
      "import type { Feature } from './feature.types.js'; export function feature(value: Feature): Feature { return value; }",
    );
    write(
      join(root, 'consumer.ts'),
      "import type { Feature } from './feature.types.js'; export const value: Feature = { dependency: 1 };",
    );

    const result = await collapseTypeFiles(root, { importFanIn: new Map() });

    expect(result.pairs).toBe(1);
    expect(result.skippedFiles).toEqual([]);
    const owner = readFileSync(join(root, 'feature.ts'), 'utf8');
    expect(owner).toContain("import type { Dependency } from './dependency.js';");
    expect(owner).not.toContain('feature.types');
    expect(owner).toContain('export type Feature');
    expect(readFileSync(join(root, 'consumer.ts'), 'utf8')).toContain("from './feature.js'");
  });

  it('places runtime catalogs before owner initialization and merges overlapping imports', async () => {
    const root = fixture();
    write(join(root, 'library.ts'), 'export type A = string; export type B = number;');
    write(
      join(root, 'catalog.types.ts'),
      "import type { A, B } from './library.js'; export const VALUES = ['a'] as const; export type Value = A | B;",
    );
    write(
      join(root, 'catalog.ts'),
      "import type { A } from './library.js'; import type { Value } from './catalog.types.js'; const Schema = VALUES; export function read(value: Value | A) { return Schema.includes(value as 'a'); }",
    );

    await collapseTypeFiles(root, { importFanIn: new Map() });

    const owner = readFileSync(join(root, 'catalog.ts'), 'utf8');
    expect(owner.match(/from '\.\/library\.js'/gu)?.length).toBe(1);
    expect(owner.indexOf('export const VALUES')).toBeLessThan(owner.indexOf('const Schema'));
  });

  it('unions partially overlapping type imports from the same source', async () => {
    const root = fixture();
    write(
      join(root, 'library.ts'),
      'export type Fabric = string; export type FabricAttribute = string; export type FabricPriceTier = number; export type FabricRoll = boolean;',
    );
    write(
      join(root, 'fabrics.dao.types.ts'),
      "import type { FabricAttribute, FabricPriceTier, FabricRoll } from './library.js'; export type AttributeRow = { roll: FabricRoll; tier: FabricPriceTier; attribute: FabricAttribute };",
    );
    write(
      join(root, 'fabrics.dao.ts'),
      "import type { AttributeRow } from './fabrics.dao.types.js'; import type { Fabric, FabricAttribute, FabricRoll } from './library.js'; export type Row = AttributeRow; export type Item = Fabric;",
    );

    await collapseTypeFiles(root, { importFanIn: new Map() });

    const owner = readFileSync(join(root, 'fabrics.dao.ts'), 'utf8');
    expect(owner.match(/from '\.\/library\.js'/gu)?.length).toBe(1);
    expect(owner).toContain(
      "import type { Fabric, FabricAttribute, FabricRoll, FabricPriceTier } from './library.js';",
    );
    expect(owner).toContain('export type AttributeRow');
    expect(owner).not.toContain('fabrics.dao.types');
  });

  it('collapses into same-directory route.ts among fallow importers', async () => {
    const root = fixture();
    write(
      join(root, 'api', 'mailing-api.types.ts'),
      'export type MailingApiRouteContext = { id: string };',
    );
    write(
      join(root, 'api', 'mailing-api.helpers.ts'),
      "import type { MailingApiRouteContext } from './mailing-api.types.js'; export function contextId(context: MailingApiRouteContext): string { return context.id; }",
    );
    write(
      join(root, 'api', 'route.ts'),
      "import type { MailingApiRouteContext } from './mailing-api.types.js'; export async function GET(_request: Request, context: MailingApiRouteContext): Promise<null> { return null; }",
    );

    const result = await collapseTypeFiles(root, {
      importFanIn: fanIn(root, {
        'api/mailing-api.types.ts': ['api/mailing-api.helpers.ts', 'api/route.ts'],
      }),
    });

    expect(result.pairs).toBe(1);
    expect(result.skippedFiles).toEqual([]);
    const route = readFileSync(join(root, 'api', 'route.ts'), 'utf8');
    expect(route).toContain('export type MailingApiRouteContext');
    expect(route).not.toContain('mailing-api.types');
    expect(readFileSync(join(root, 'api', 'mailing-api.helpers.ts'), 'utf8')).toContain(
      "from './route.js'",
    );
  });

  it('merges multiple type files into the same route.ts owner', async () => {
    const root = fixture();
    write(join(root, 'api', 'alpha.types.ts'), 'export type Alpha = { id: string };');
    write(join(root, 'api', 'beta.types.ts'), 'export type Beta = { name: string };');
    write(
      join(root, 'api', 'route.ts'),
      "import type { Alpha } from './alpha.types.js'; import type { Beta } from './beta.types.js'; export type Pair = [Alpha, Beta];",
    );

    await collapseTypeFiles(root, {
      importFanIn: fanIn(root, {
        'api/alpha.types.ts': ['api/route.ts'],
        'api/beta.types.ts': ['api/route.ts'],
      }),
    });

    const route = readFileSync(join(root, 'api', 'route.ts'), 'utf8');
    expect(route).toContain('export type Alpha');
    expect(route).toContain('export type Beta');
    expect(route).not.toContain('alpha.types');
    expect(route).not.toContain('beta.types');
  });

  it('collapses into same-directory page.tsx before helpers', async () => {
    const root = fixture();
    write(
      join(root, 'fabrics', 'fabrics-page.types.ts'),
      'export type FabricsPageProps = { title: string };',
    );
    write(
      join(root, 'fabrics', 'fabrics-page.helpers.ts'),
      "import type { FabricsPageProps } from './fabrics-page.types.js'; export function titleOf(props: FabricsPageProps): string { return props.title; }",
    );
    write(
      join(root, 'fabrics', 'page.tsx'),
      "import type { FabricsPageProps } from './fabrics-page.types.js'; export default function Page(props: FabricsPageProps) { return props.title; }",
    );

    await collapseTypeFiles(root, {
      importFanIn: fanIn(root, {
        'fabrics/fabrics-page.types.ts': ['fabrics/fabrics-page.helpers.ts', 'fabrics/page.tsx'],
      }),
    });

    const page = readFileSync(join(root, 'fabrics', 'page.tsx'), 'utf8');
    expect(page).toContain('export type FabricsPageProps');
    expect(readFileSync(join(root, 'fabrics', 'fabrics-page.helpers.ts'), 'utf8')).toContain(
      "from './page.js'",
    );
  });

  it('skips and reports ownerless type files by default', async () => {
    const root = fixture();
    const typeFile = join(root, 'contract.types.ts');
    write(typeFile, 'export type Contract = string;');

    const result = await collapseTypeFiles(root, { importFanIn: new Map() });

    expect(result).toEqual({
      pairs: 0,
      skippedFiles: ['contract.types.ts'],
      changedFiles: 0,
      dryRun: false,
    });
    expect(readFileSync(typeFile, 'utf8')).toContain('Contract');
  });

  it('reports a dry run without changing files', async () => {
    const root = fixture();
    const owner = join(root, 'item.ts');
    const typeFile = join(root, 'item.types.ts');
    write(owner, "import type { Item } from './item.types.js'; export const item: Item = {};");
    write(typeFile, 'export type Item = {};');

    const result = await collapseTypeFiles(root, { dryRun: true, importFanIn: new Map() });

    expect(result).toEqual({ pairs: 1, skippedFiles: [], changedFiles: 1, dryRun: true });
    expect(readFileSync(owner, 'utf8')).toContain('item.types.js');
    expect(readFileSync(typeFile, 'utf8')).toContain('Item');
  });
});
