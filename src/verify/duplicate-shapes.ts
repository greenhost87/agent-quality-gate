import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { Node, Project, TypeFormatFlags } from 'ts-morph';
import type {
  InterfaceDeclaration,
  Node as TsMorphNode,
  Symbol as TsMorphSymbol,
  Type as TsMorphType,
  TypeAliasDeclaration,
} from 'ts-morph';

import type { DuplicateShapesConfig, ShapeDeclaration, ShapeFinding } from './duplicate-shapes.types.js';

const FORMAT_FLAGS =
  TypeFormatFlags.NoTruncation | TypeFormatFlags.UseAliasDefinedOutsideCurrentScope | TypeFormatFlags.InTypeAlias;

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

function propertyEntry(symbol: TsMorphSymbol, referenceNode: TsMorphNode): string {
  const declaration = symbol.getDeclarations()[0];
  const name = symbol.getName();
  if (!declaration) {
    const fallbackType = symbol.getTypeAtLocation(referenceNode);
    return `${name}: ${normalizeTypeText(fallbackType.getText(referenceNode, FORMAT_FLAGS))}`;
  }
  if (Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration)) {
    return [
      declaration.isReadonly() ? 'readonly ' : '',
      name,
      declaration.hasQuestionToken() ? '?' : '',
      ': ',
      normalizeTypeText(declaration.getType().getText(referenceNode, FORMAT_FLAGS)),
    ].join('');
  }
  if (Node.isMethodSignature(declaration) || Node.isMethodDeclaration(declaration)) {
    return `${name}: ${normalizeTypeText(declaration.getText())}`;
  }
  return `${name}: ${normalizeTypeText(symbol.getTypeAtLocation(referenceNode).getText(referenceNode, FORMAT_FLAGS))}`;
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

function isObjectLikeType(type: TsMorphType): boolean {
  return type.isObject();
}

function collectProperties(declaration: InterfaceDeclaration | TypeAliasDeclaration): string[] {
  return declaration
    .getType()
    .getProperties()
    .map((symbol) => propertyEntry(symbol, declaration))
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

function collectShapeDeclarations(cwd: string, config: DuplicateShapesConfig): ShapeDeclaration[] {
  const project = new Project({ tsConfigFilePath: resolve(cwd, config.tsconfig ?? 'tsconfig.json') });
  const allowNames = new Set(config.allowNames ?? []);
  const minProperties = Number(config.minProperties ?? 3);
  const declarations: ShapeDeclaration[] = [];
  const sourceFiles = project.getSourceFiles(config.include ?? ['src/**/*.ts', 'src/**/*.tsx']).filter((sourceFile) => {
    const relativePath = normalizePath(relative(cwd, sourceFile.getFilePath()));
    return !matchesAny(relativePath, config.exclude ?? []);
  });

  for (const sourceFile of sourceFiles) {
    const relativePath = normalizePath(relative(cwd, sourceFile.getFilePath()));
    for (const declaration of sourceFile.getInterfaces()) {
      const name = declaration.getName();
      if (!declaration.isExported() || allowNames.has(name) || !isObjectLikeType(declaration.getType())) {
        continue;
      }
      appendShapeDeclaration(declarations, 'interface', name, relativePath, collectProperties(declaration), minProperties);
    }
    for (const declaration of sourceFile.getTypeAliases()) {
      const name = declaration.getName();
      const typeNode = declaration.getTypeNode();
      if (
        !declaration.isExported() ||
        allowNames.has(name) ||
        (typeNode && Node.isTypeReference(typeNode) && !typeNode.getTypeArguments().length) ||
        !isObjectLikeType(declaration.getType())
      ) {
        continue;
      }
      appendShapeDeclaration(declarations, 'type', name, relativePath, collectProperties(declaration), minProperties);
    }
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
    lines.push(
      `- similarity=${finding.similarity.toFixed(2)} | ${finding.left.name} (${finding.left.file}) <-> ${finding.right.name} (${finding.right.file})`
    );
    lines.push(`  shared=${finding.shared.length}/${Math.max(finding.left.properties.length, finding.right.properties.length)}`);
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
