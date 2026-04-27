import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import ts from 'typescript';

import type { DuplicateShapesConfig, ShapeDeclaration, ShapeFinding } from './duplicate-shapes.types.js';

const FORMAT_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.InTypeAlias;

function normalizePath(value = ''): string {
  return value.replace(/\\/g, '/');
}

function escapeRegexChar(char: string): string {
  return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
}

function globToRegExp(glob: string): RegExp {
  const normalizedGlob = normalizePath(glob);
  let source = '';
  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const current = normalizedGlob[index] ?? '';
    const next = normalizedGlob[index + 1];
    if (current === '*') {
      source += next === '*' ? '.*' : '[^/]*';
      index += next === '*' ? 1 : 0;
      continue;
    }
    source += current === '?' ? '[^/]' : escapeRegexChar(current);
  }
  return new RegExp(`^${source}$`);
}

function matchesAny(filepath: string, patterns: readonly string[] = []): boolean {
  const normalized = normalizePath(filepath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function normalizeTypeText(typeText: string): string {
  return typeText.replace(/\s+/g, ' ').trim();
}

function hasReadonlyModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword))
  );
}

function propertyNameText(symbol: ts.Symbol, declaration: ts.Declaration | undefined): string {
  if (
    declaration &&
    (ts.isPropertySignature(declaration) ||
      ts.isPropertyDeclaration(declaration) ||
      ts.isMethodSignature(declaration) ||
      ts.isMethodDeclaration(declaration))
  ) {
    return declaration.name.getText();
  }
  return symbol.getName();
}

function propertyEntry(checker: ts.TypeChecker, symbol: ts.Symbol, referenceNode: ts.Node): string {
  const declaration = symbol.getDeclarations()?.[0];
  const name = symbol.getName();
  if (!declaration) {
    const fallbackType = checker.getTypeOfSymbolAtLocation(symbol, referenceNode);
    return `${name}: ${normalizeTypeText(checker.typeToString(fallbackType, referenceNode, FORMAT_FLAGS))}`;
  }
  if (ts.isPropertySignature(declaration) || ts.isPropertyDeclaration(declaration)) {
    const propertyType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    return [
      hasReadonlyModifier(declaration) ? 'readonly ' : '',
      propertyNameText(symbol, declaration),
      declaration.questionToken ? '?' : '',
      ': ',
      normalizeTypeText(checker.typeToString(propertyType, referenceNode, FORMAT_FLAGS)),
    ].join('');
  }
  if (ts.isMethodSignature(declaration) || ts.isMethodDeclaration(declaration)) {
    return `${propertyNameText(symbol, declaration)}: ${normalizeTypeText(declaration.getText())}`;
  }
  const fallbackType = checker.getTypeOfSymbolAtLocation(symbol, referenceNode);
  return `${name}: ${normalizeTypeText(checker.typeToString(fallbackType, referenceNode, FORMAT_FLAGS))}`;
}

function compareSimilarity(leftDeclaration: ShapeDeclaration, rightDeclaration: ShapeDeclaration): number {
  const left = new Set(leftDeclaration.properties);
  const right = new Set(rightDeclaration.properties);
  const common = [...left].filter((entry) => right.has(entry)).length;
  return common / Math.max(left.size, right.size);
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join('::');
}

function isObjectLikeType(type: ts.Type): boolean {
  return Boolean(type.flags & ts.TypeFlags.Object);
}

function collectProperties(
  checker: ts.TypeChecker,
  declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration
): string[] {
  return checker
    .getPropertiesOfType(checker.getTypeAtLocation(declaration))
    .map((symbol) => propertyEntry(checker, symbol, declaration))
    .sort();
}

function appendShapeDeclaration(
  declarations: ShapeDeclaration[],
  kind: ShapeDeclaration['kind'],
  name: string,
  file: string,
  properties: string[],
  minProperties: number
): void {
  if (properties.length >= minProperties) {
    declarations.push({ kind, name, file, properties });
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isAllowPairArray(value: unknown): value is [string, string][] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'string'
    )
  );
}

function getObjectProperty(value: object, propertyName: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, propertyName)
    ? Object.getOwnPropertyDescriptor(value, propertyName)?.value
    : undefined;
}

function readDuplicateShapesConfig(configPath: string): DuplicateShapesConfig {
  const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('verify: duplicate-shapes config must be an object');
  }
  const tsconfig = getObjectProperty(parsed, 'tsconfig');
  const include = getObjectProperty(parsed, 'include');
  const exclude = getObjectProperty(parsed, 'exclude');
  const similarityThreshold = getObjectProperty(parsed, 'similarityThreshold');
  const minProperties = getObjectProperty(parsed, 'minProperties');
  const allowNames = getObjectProperty(parsed, 'allowNames');
  const allowPairs = getObjectProperty(parsed, 'allowPairs');
  return {
    ...(typeof tsconfig === 'string' ? { tsconfig } : {}),
    ...(isStringArray(include) ? { include } : {}),
    ...(isStringArray(exclude) ? { exclude } : {}),
    ...(typeof similarityThreshold === 'number' ? { similarityThreshold } : {}),
    ...(typeof minProperties === 'number' ? { minProperties } : {}),
    ...(isStringArray(allowNames) ? { allowNames } : {}),
    ...(isAllowPairArray(allowPairs) ? { allowPairs } : {}),
  };
}

function isExportedDeclaration(declaration: ts.Declaration): boolean {
  return (
    ts.canHaveModifiers(declaration) &&
    Boolean(ts.getModifiers(declaration)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
  );
}

function readProgram(cwd: string, config: DuplicateShapesConfig): ts.Program {
  const tsconfigPath = resolve(cwd, config.tsconfig ?? 'tsconfig.json');
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, cwd, undefined, tsconfigPath);
  if (parsedConfig.errors.length > 0) {
    throw new Error(ts.flattenDiagnosticMessageText(parsedConfig.errors[0]?.messageText ?? 'invalid tsconfig', '\n'));
  }
  return ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    projectReferences: parsedConfig.projectReferences,
  });
}

function isIncludedSourceFile(cwd: string, sourceFile: ts.SourceFile, config: DuplicateShapesConfig): boolean {
  if (sourceFile.isDeclarationFile) {
    return false;
  }
  const relativePath = normalizePath(relative(cwd, sourceFile.fileName));
  return (
    matchesAny(relativePath, config.include ?? ['src/**/*.ts', 'src/**/*.tsx']) &&
    !matchesAny(relativePath, config.exclude ?? [])
  );
}

function collectShapeDeclarations(cwd: string, config: DuplicateShapesConfig): ShapeDeclaration[] {
  const program = readProgram(cwd, config);
  const checker = program.getTypeChecker();
  const allowNames = new Set(config.allowNames ?? []);
  const minProperties = Number(config.minProperties ?? 3);
  const declarations: ShapeDeclaration[] = [];
  const sourceFiles = program.getSourceFiles().filter((sourceFile) => isIncludedSourceFile(cwd, sourceFile, config));

  for (const sourceFile of sourceFiles) {
    const relativePath = normalizePath(relative(cwd, sourceFile.fileName));
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const type = checker.getTypeAtLocation(node);
        if (!isExportedDeclaration(node) || allowNames.has(name) || !isObjectLikeType(type)) {
          return;
        }
        appendShapeDeclaration(
          declarations,
          'interface',
          name,
          relativePath,
          collectProperties(checker, node),
          minProperties
        );
        return;
      }
      if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        const type = checker.getTypeAtLocation(node);
        if (
          !isExportedDeclaration(node) ||
          allowNames.has(name) ||
          (ts.isTypeReferenceNode(node.type) && node.type.typeArguments === undefined) ||
          !isObjectLikeType(type)
        ) {
          return;
        }
        appendShapeDeclaration(
          declarations,
          'type',
          name,
          relativePath,
          collectProperties(checker, node),
          minProperties
        );
      }
    });
  }
  return declarations;
}

function findDuplicateShapes(declarations: readonly ShapeDeclaration[], config: DuplicateShapesConfig): ShapeFinding[] {
  const similarityThreshold = Number(config.similarityThreshold ?? 0.9);
  const allowPairs = new Set((config.allowPairs ?? []).map(([left, right]) => pairKey(left, right)));
  const findings: ShapeFinding[] = [];
  for (let leftIndex = 0; leftIndex < declarations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < declarations.length; rightIndex += 1) {
      const left = declarations[leftIndex];
      const right = declarations[rightIndex];
      if (!left || !right || allowPairs.has(pairKey(left.name, right.name))) {
        continue;
      }
      const similarity = compareSimilarity(left, right);
      if (similarity >= similarityThreshold) {
        findings.push({
          similarity,
          left,
          right,
          shared: left.properties.filter((entry) => right.properties.includes(entry)),
        });
      }
    }
  }
  return findings.sort((left, right) => right.similarity - left.similarity);
}

function renderDuplicateShapes(findings: readonly ShapeFinding[]): string {
  if (!findings.length) {
    return 'No duplicate or near-duplicate exported object shapes found.\n';
  }
  const lines = ['Duplicate or near-duplicate exported object shapes detected:', ''];
  for (const finding of findings) {
    const leftShape = `${finding.left.name} (${finding.left.file})`;
    const rightShape = `${finding.right.name} (${finding.right.file})`;
    const comparedShapes = `${leftShape} <-> ${rightShape}`;
    lines.push(
      `- similarity=${finding.similarity.toFixed(2)} | ${comparedShapes}`
    );
    lines.push(
      `  shared=${finding.shared.length}/${Math.max(finding.left.properties.length, finding.right.properties.length)}`
    );
    const preview = finding.shared.slice(0, 6);
    if (preview.length) {
      lines.push(`  preview=${preview.join(' | ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function runDuplicateShapesStep(configPath: string): number {
  const cwd = process.cwd();
  const config = readDuplicateShapesConfig(resolve(cwd, configPath));
  const findings = findDuplicateShapes(collectShapeDeclarations(cwd, config), config);
  const output = renderDuplicateShapes(findings);
  if (findings.length) {
    process.stderr.write(output);
    return 1;
  }
  process.stdout.write(output);
  return 0;
}
