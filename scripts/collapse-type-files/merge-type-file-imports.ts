import { dirname, relative, resolve, sep } from 'node:path';

import {
  parseSync,
  type Directive,
  type ImportDeclaration,
  type Program,
  type Statement,
} from 'oxc-parser';

type Edit = {
  start: number;
  end: number;
  replacement: string;
};

export type ExtractedImport = {
  text: string;
  source: string;
  names: Set<string>;
  namedOnly: boolean;
  typeOnly: boolean;
};

function language(path: string): 'ts' | 'tsx' {
  return path.endsWith('.tsx') ? 'tsx' : 'ts';
}

export function parseSource(path: string, code: string): Program {
  const parsed = parseSync(path, code, {
    lang: language(path),
    sourceType: 'module',
    range: true,
  });
  if (parsed.errors.length > 0) {
    const detail = parsed.errors.map((error) => error.message).join('; ');
    throw new Error(`${path}: ${detail}`);
  }
  return parsed.program;
}

function moduleSource(
  statement: Directive | Statement,
): { value: string; start: number; end: number } | null {
  if (statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration') {
    return statement.source;
  }
  if (statement.type === 'ExportNamedDeclaration' && statement.source !== null) {
    return statement.source;
  }
  return null;
}

function applyEdits(code: string, edits: readonly Edit[]): string {
  let output = code;
  const descending = [...edits].sort((left, right) => right.start - left.start);
  for (const edit of descending) {
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
  }
  return output;
}

function moduleCandidates(basePath: string, specifier: string): string[] {
  const candidates = [basePath];
  if (specifier.endsWith('.js')) {
    candidates.push(basePath.slice(0, -3) + '.ts', basePath.slice(0, -3) + '.tsx');
  } else if (!/\.[cm]?[jt]sx?$/u.test(specifier)) {
    candidates.push(`${basePath}.ts`, `${basePath}.tsx`);
  }
  return candidates;
}

function resolvedTypeFile(
  importer: string,
  specifier: string,
  ownersByTypeFile: ReadonlyMap<string, string>,
  projectRoot: string,
): string | null {
  let basePath: string | null = null;
  if (specifier.startsWith('.')) {
    basePath = resolve(dirname(importer), specifier);
  } else if (specifier.startsWith('@/')) {
    basePath = resolve(projectRoot, specifier.slice(2));
  }
  if (basePath === null) {
    return null;
  }
  return (
    moduleCandidates(basePath, specifier).find((candidate) => ownersByTypeFile.has(candidate)) ??
    null
  );
}

function ownerSpecifier(
  importer: string,
  oldSpecifier: string,
  owner: string,
  projectRoot: string,
): string {
  if (oldSpecifier.startsWith('@/')) {
    let target = relative(projectRoot, owner).split(sep).join('/');
    if (oldSpecifier.endsWith('.js')) {
      target = target.replace(/\.tsx?$/u, '.js');
    } else if (!/\.[cm]?[jt]sx?$/u.test(oldSpecifier)) {
      target = target.replace(/\.tsx?$/u, '');
    }
    return `@/${target}`;
  }
  let target = relative(dirname(importer), owner).split(sep).join('/');
  if (!target.startsWith('.')) {
    target = `./${target}`;
  }
  if (oldSpecifier.endsWith('.js')) {
    return target.replace(/\.tsx?$/u, '.js');
  }
  if (!/\.[cm]?[jt]sx?$/u.test(oldSpecifier)) {
    return target.replace(/\.tsx?$/u, '');
  }
  return target;
}

export function rewriteTypeReferences(
  path: string,
  code: string,
  ownersByTypeFile: ReadonlyMap<string, string>,
  projectRoot: string,
): string {
  const edits: Edit[] = [];
  for (const statement of parseSource(path, code).body) {
    const source = moduleSource(statement);
    if (source === null) {
      continue;
    }
    const typeFile = resolvedTypeFile(path, source.value, ownersByTypeFile, projectRoot);
    if (typeFile === null) {
      continue;
    }
    const owner = ownersByTypeFile.get(typeFile);
    if (owner === undefined) {
      continue;
    }
    if (owner === path) {
      edits.push({ start: statement.start, end: statement.end, replacement: '' });
      continue;
    }
    const quote = code[source.start] ?? "'";
    const replacement = ownerSpecifier(path, source.value, owner, projectRoot);
    edits.push({
      start: source.start,
      end: source.end,
      replacement: `${quote}${replacement}${quote}`,
    });
  }
  return applyEdits(code, edits);
}

function importNames(statement: ImportDeclaration): Set<string> {
  return new Set(statement.specifiers.map((specifier) => specifier.local.name));
}

function isTypeOnlyImport(statement: ImportDeclaration): boolean {
  return (
    statement.importKind === 'type' ||
    (statement.specifiers.length > 0 &&
      statement.specifiers.every(
        (specifier) => 'importKind' in specifier && specifier.importKind === 'type',
      ))
  );
}

function isNamedOnlyImport(statement: ImportDeclaration): boolean {
  return statement.specifiers.every((specifier) => specifier.type === 'ImportSpecifier');
}

function sourceQuote(code: string, statement: ImportDeclaration): string {
  return code[statement.source.start] ?? "'";
}

function mergeImportNames(existing: Iterable<string>, incoming: Iterable<string>): string[] {
  return [...new Set([...existing, ...incoming])];
}

function typeNamedImportText(names: readonly string[], source: string, quote: string): string {
  return `import type { ${names.join(', ')} } from ${quote}${source}${quote};`;
}

export function removeImports(
  path: string,
  code: string,
): { body: string; imports: ExtractedImport[] } {
  const edits: Edit[] = [];
  const imports: ExtractedImport[] = [];
  for (const statement of parseSource(path, code).body) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }
    imports.push({
      text: code.slice(statement.start, statement.end),
      source: statement.source.value,
      names: importNames(statement),
      namedOnly: isNamedOnlyImport(statement),
      typeOnly: isTypeOnlyImport(statement),
    });
    edits.push({ start: statement.start, end: statement.end, replacement: '' });
  }
  return { body: applyEdits(code, edits).trim(), imports };
}

export function mergedImports(
  path: string,
  ownerCode: string,
  extractedImports: readonly ExtractedImport[],
): { owner: string; imports: string[] } {
  const ownerImports = parseSource(path, ownerCode).body.filter(
    (statement): statement is ImportDeclaration => statement.type === 'ImportDeclaration',
  );
  const ownerEdits: Edit[] = [];
  const imports: string[] = [];
  for (const extracted of extractedImports) {
    const matching = ownerImports.filter(
      (statement) => statement.source.value === extracted.source && isTypeOnlyImport(statement),
    );
    if (matching.length === 0) {
      imports.push(extracted.text);
      continue;
    }
    const existingNames = new Set(matching.flatMap((statement) => [...importNames(statement)]));
    if ([...extracted.names].every((name) => existingNames.has(name))) {
      continue;
    }
    const canUnion =
      extracted.typeOnly &&
      extracted.namedOnly &&
      matching.every((statement) => isNamedOnlyImport(statement));
    if (!canUnion) {
      throw new Error(
        `${path}: overlapping imports from ${extracted.source} require manual merging`,
      );
    }
    for (const statement of matching) {
      ownerEdits.push({ start: statement.start, end: statement.end, replacement: '' });
    }
    const first = matching[0];
    const quote = first === undefined ? "'" : sourceQuote(ownerCode, first);
    imports.push(
      typeNamedImportText(
        mergeImportNames(existingNames, extracted.names),
        extracted.source,
        quote,
      ),
    );
  }
  return { owner: applyEdits(ownerCode, ownerEdits), imports };
}

export function importInsertionOffset(path: string, code: string): number {
  const program = parseSource(path, code);
  let lastImportEnd: number | null = null;
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      lastImportEnd = statement.end;
    }
  }
  if (lastImportEnd !== null) {
    return lastImportEnd;
  }
  return program.body[0]?.start ?? code.length;
}
