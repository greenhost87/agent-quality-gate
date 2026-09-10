import { parseSync } from 'oxc-parser';
import type { Program } from 'oxc-parser';
import type { ESTree, VisitorWithHooks } from '@oxlint/plugins';

import { forEachAstChild } from '../oxlint-walk/ast-node-schema.ts';
import { attachAstParent, isAstNode } from '../oxlint-walk/oxlint-walk.ts';
import type { ParsedProgram } from './bench-create-once-rule.js';

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

function callVisitor(visitors: VisitorWithHooks, key: string, node: ESTree.Node): void {
  if (key === 'before' || key === 'after') {
    return;
  }
  const handler = Reflect.get(visitors, key);
  if (typeof handler === 'function') {
    Reflect.apply(handler, undefined, [node]);
  }
}

function walkNode(node: ESTree.Node, parent: ESTree.Node | null, visitors: VisitorWithHooks): void {
  attachAstParent(node, parent);
  callVisitor(visitors, node.type, node);

  forEachAstChild(node, (child) => {
    if (isAstNode(child)) {
      walkNode(child, node, visitors);
    }
  });

  callVisitor(visitors, `${node.type}:exit`, node);
}

export function walkProgram(program: Program, visitors: VisitorWithHooks): void {
  if (!isAstNode(program)) {
    throw new Error('parsed program is not an AST node');
  }
  walkNode(program, null, visitors);
}
