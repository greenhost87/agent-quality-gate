#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { Node, Project, TypeFormatFlags } from 'ts-morph';

function normalizePath(value = '') {
  return value.replace(/\\/g, '/');
}

function escapeRegexChar(char) {
  return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
}

function globToRegExp(glob) {
  const normalizedGlob = normalizePath(glob);
  let source = '';

  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const current = normalizedGlob[index];
    const next = normalizedGlob[index + 1];

    if (current === '*') {
      if (next === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (current === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegexChar(current);
  }

  return new RegExp(`^${source}$`);
}

function matchesAny(filepath, patterns = []) {
  const normalized = normalizePath(filepath);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function normalizeTypeText(typeText) {
  return typeText.replace(/\s+/g, ' ').trim();
}

function propertyEntry(symbol, referenceNode) {
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

function compareSimilarity(a, b) {
  const left = new Set(a.properties);
  const right = new Set(b.properties);
  const common = [...left].filter((entry) => right.has(entry)).length;
  return common / Math.max(left.size, right.size);
}

function pairKey(a, b) {
  return [a, b].sort().join('::');
}

function isObjectLikeType(type) {
  return type.isObject();
}

const FORMAT_FLAGS =
  TypeFormatFlags.NoTruncation | TypeFormatFlags.UseAliasDefinedOutsideCurrentScope | TypeFormatFlags.InTypeAlias;

const cwd = process.cwd();
const configPath = path.resolve(cwd, process.argv[2] ?? './tools/analyze/duplicate-shapes.config.json');

const rawConfig = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(rawConfig);

const project = new Project({
  tsConfigFilePath: path.resolve(cwd, config.tsconfig ?? 'tsconfig.json'),
});

const similarityThreshold = Number(config.similarityThreshold ?? 0.9);
const minProperties = Number(config.minProperties ?? 3);
const allowNames = new Set(config.allowNames ?? []);
const allowPairs = new Set((config.allowPairs ?? []).map(([a, b]) => pairKey(a, b)));

const sourceFiles = project.getSourceFiles(config.include ?? ['src/**/*.ts', 'src/**/*.tsx']).filter((sourceFile) => {
  const relativePath = normalizePath(path.relative(cwd, sourceFile.getFilePath()));
  return !matchesAny(relativePath, config.exclude ?? []);
});

const declarations = [];

for (const sourceFile of sourceFiles) {
  const relativePath = normalizePath(path.relative(cwd, sourceFile.getFilePath()));

  for (const declaration of sourceFile.getInterfaces()) {
    if (!declaration.isExported()) {
      continue;
    }

    const name = declaration.getName();
    if (allowNames.has(name)) {
      continue;
    }

    const declarationType = declaration.getType();
    if (!isObjectLikeType(declarationType)) {
      continue;
    }

    const properties = declaration
      .getType()
      .getProperties()
      .map((symbol) => propertyEntry(symbol, declaration))
      .sort();

    if (properties.length < minProperties) {
      continue;
    }

    declarations.push({
      kind: 'interface',
      name,
      file: relativePath,
      properties,
    });
  }

  for (const declaration of sourceFile.getTypeAliases()) {
    if (!declaration.isExported()) {
      continue;
    }

    const name = declaration.getName();
    if (allowNames.has(name)) {
      continue;
    }

    const typeNode = declaration.getTypeNode();
    if (typeNode && Node.isTypeReference(typeNode) && !typeNode.getTypeArguments().length) {
      continue;
    }

    const declarationType = declaration.getType();
    if (!isObjectLikeType(declarationType)) {
      continue;
    }

    const properties = declaration
      .getType()
      .getProperties()
      .map((symbol) => propertyEntry(symbol, declaration))
      .sort();

    if (properties.length < minProperties) {
      continue;
    }

    declarations.push({
      kind: 'type',
      name,
      file: relativePath,
      properties,
    });
  }
}

const findings = [];

for (let leftIndex = 0; leftIndex < declarations.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < declarations.length; rightIndex += 1) {
    const left = declarations[leftIndex];
    const right = declarations[rightIndex];

    if (allowPairs.has(pairKey(left.name, right.name))) {
      continue;
    }

    const similarity = compareSimilarity(left, right);
    if (similarity < similarityThreshold) {
      continue;
    }

    const shared = left.properties.filter((entry) => right.properties.includes(entry));

    findings.push({
      similarity,
      left,
      right,
      shared,
    });
  }
}

findings.sort((a, b) => b.similarity - a.similarity);

if (!findings.length) {
  console.log('No duplicate or near-duplicate exported object shapes found.');
  process.exit(0);
}

console.error('Duplicate or near-duplicate exported object shapes detected:\n');

for (const finding of findings) {
  console.error(
    `- similarity=${finding.similarity.toFixed(2)} | ${finding.left.name} (${finding.left.file}) <-> ${finding.right.name} (${finding.right.file})`
  );
  console.error(
    `  shared=${finding.shared.length}/${Math.max(finding.left.properties.length, finding.right.properties.length)}`
  );

  const preview = finding.shared.slice(0, 6);
  if (preview.length) {
    console.error(`  preview=${preview.join(' | ')}`);
  }

  console.error('');
}

process.exitCode = 1;
