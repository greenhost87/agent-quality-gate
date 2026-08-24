import { parseSync, visitorKeys } from 'oxc-parser';
import type { Program } from 'oxc-parser';
import type { VisitorWithHooks } from '@oxlint/plugins';

import type { AstChildValue, AstNode, ParsedProgram } from './bench-create-once-rule.types.js';

export function languageFromFilename(filename: string): 'js' | 'jsx' | 'ts' | 'tsx' {
  if (filename.endsWith('.tsx')) {
    return 'tsx';
  }
  if (filename.endsWith('.ts') || filename.endsWith('.mts') || filename.endsWith('.cts')) {
    return 'ts';
  }
  if (filename.endsWith('.jsx')) {
    return 'jsx';
  }
  return 'js';
}

export function parseFixture(filename: string, code: string): ParsedProgram {
  const parsed = parseSync(filename, code, {
    lang: languageFromFilename(filename),
    sourceType: 'module',
    range: true,
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`${filename}: ${first?.message ?? 'parse failure'}`);
  }
  return {
    filename,
    code,
    program: parsed.program,
  };
}

function isAstNode(value: object): value is AstNode {
  return !Array.isArray(value) && 'type' in value && typeof value.type === 'string';
}

function childValue(node: AstNode, key: string): AstChildValue {
  const value = node[key];
  if (value == null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'object') {
    return value;
  }
  return null;
}

function callVisitor(visitors: VisitorWithHooks, key: string, node: AstNode): void {
  if (key === 'before' || key === 'after') {
    return;
  }
  const handler = Reflect.get(visitors, key);
  if (typeof handler === 'function') {
    Reflect.apply(handler, undefined, [node]);
  }
}

function walkChild(value: AstChildValue, parent: AstNode, visitors: VisitorWithHooks): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      walkNode(entry, parent, visitors);
    }
    return;
  }
  if (value != null && typeof value === 'object') {
    walkNode(value, parent, visitors);
  }
}

function walkNode(node: AstNode, parent: AstNode | null, visitors: VisitorWithHooks): void {
  node.parent = parent;
  callVisitor(visitors, node.type, node);

  const keys: string[] = visitorKeys[node.type] ?? [];
  for (const key of keys) {
    walkChild(childValue(node, key), node, visitors);
  }

  callVisitor(visitors, `${node.type}:exit`, node);
}

export function walkProgram(program: Program, visitors: VisitorWithHooks): void {
  if (!isAstNode(program)) {
    throw new Error('parsed program is not an AST node');
  }
  walkNode(program, null, visitors);
}
