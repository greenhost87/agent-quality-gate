import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from 'oxc-parser';

import {
  astIndex,
  astIndexBuildStats,
  clearAstIndex,
  resetAstIndexBuildCount,
} from 'agent-quality-gate/oxlint-walk/ast-index';
import {
  eachParamUnion,
  forEachParamList,
  functionParamVisitors,
  isAstNode,
  nodeParams,
  paramTypeAnnotation,
  paramUnionType,
  unwrapExpression,
  walkAst,
  walkAstSkippingTypeAndJsxMarkup,
  walkAstSkippingTypeSubtrees,
  walkJsxSurfaceNodes,
} from 'agent-quality-gate/oxlint-walk';

const PARAM_OWNERS_FIXTURE = readFileSync(
  join(import.meta.dir, 'fixtures', 'param-owners.txt'),
  'utf8',
);

function parseProgram(code: string, lang: 'ts' | 'tsx' = 'ts') {
  const parsed = parseSync(`fixture.${lang === 'tsx' ? 'tsx' : 'ts'}`, code, {
    lang,
    sourceType: 'module',
    range: true,
  });
  expect(parsed.errors).toEqual([]);
  expect(isAstNode(parsed.program)).toBe(true);
  if (!isAstNode(parsed.program)) {
    throw new Error('parsed program is not an AST node');
  }
  return parsed.program;
}

describe('agent-quality-gate/oxlint-walk', () => {
  it('walkAst visits the root and descendants with parents', () => {
    const program = parseProgram('const value = 1;');
    const types: string[] = [];
    walkAst(program, (node, parent) => {
      types.push(node.type);
      if (node.type === 'Program') {
        expect(parent).toBeNull();
      } else {
        expect(parent).not.toBeNull();
      }
    });
    expect(types[0]).toBe('Program');
    expect(types).toContain('VariableDeclaration');
    expect(types).toContain('Literal');
  });

  it('isAstNode accepts nodes and rejects primitives', () => {
    const program = parseProgram('void 0;');
    expect(isAstNode(program)).toBe(true);
    expect(isAstNode(null)).toBe(false);
    expect(isAstNode('Program')).toBe(false);
  });

  it('unwrapExpression strips TS, paren, and ChainExpression wrappers', () => {
    const program = parseProgram('const value = (x!.y as string)! satisfies string;');
    let foundType: string | undefined;
    walkAst(program, (node) => {
      if (node.type === 'VariableDeclarator' && node.init != null) {
        foundType = unwrapExpression(node.init).type;
      }
    });
    expect(foundType).toBe('MemberExpression');
  });

  it('unwrapExpression unwraps optional chaining via ChainExpression', () => {
    const program = parseProgram('const value = obj?.prop;');
    let foundType: string | undefined;
    walkAst(program, (node) => {
      if (node.type === 'VariableDeclarator' && node.init != null) {
        foundType = unwrapExpression(node.init).type;
      }
    });
    expect(foundType).toBe('MemberExpression');
  });

  it('walkAst skipKeys omits typeAnnotation subtrees', () => {
    const program = parseProgram('function f(x: string) { return x; }');
    const types: string[] = [];
    walkAst(
      program,
      (node) => {
        types.push(node.type);
      },
      { skipKeys: new Set(['typeAnnotation']) },
    );
    expect(types).toContain('FunctionDeclaration');
    expect(types).not.toContain('TSTypeAnnotation');
    expect(types).not.toContain('TSStringKeyword');
  });

  it('walkAstSkippingTypeSubtrees skips parameter type subtrees', () => {
    const program = parseProgram('function f(x: string) { return x; }');
    const types: string[] = [];
    walkAstSkippingTypeSubtrees(program, (node) => {
      types.push(node.type);
    });
    expect(types).toContain('FunctionDeclaration');
    expect(types).not.toContain('TSTypeAnnotation');
  });

  it('reads parameter type annotations and unions', () => {
    const program = parseProgram('function f(x: string | number) {}');
    let seenFunctionParams = false;
    walkAst(program, (node) => {
      if (node.type !== 'FunctionDeclaration') {
        return;
      }
      const params = nodeParams(node);
      expect(params).toHaveLength(1);
      const param = params?.[0];
      expect(param).toBeDefined();
      if (param === undefined) {
        return;
      }
      expect(paramTypeAnnotation(param)?.type).toBe('TSUnionType');
      expect(paramUnionType(param)?.type).toBe('TSUnionType');
      seenFunctionParams = true;
    });
    expect(seenFunctionParams).toBe(true);

    let foundUnion = false;
    forEachParamList(program, (params) => {
      expect(params).toHaveLength(1);
      foundUnion = true;
    });
    expect(foundUnion).toBe(true);

    const unions: string[] = [];
    eachParamUnion(program, (union) => {
      unions.push(union.type);
    });
    expect(unions).toEqual(['TSUnionType']);
  });

  it('walkAstSkippingTypeAndJsxMarkup still reaches runtime code inside JSX braces', () => {
    const program = parseProgram(
      'export function f(dao: { run(): void }) { return <button onClick={() => dao.run()} />; }',
      'tsx',
    );
    const types: string[] = [];
    walkAstSkippingTypeAndJsxMarkup(program, (node) => {
      types.push(node.type);
    });
    expect(types).toContain('CallExpression');
    expect(types).not.toContain('JSXText');
    expect(types.filter((type) => type === 'JSXIdentifier').length).toBe(0);
  });

  it('walkJsxSurfaceNodes visits opening elements and attributes only', () => {
    const program = parseProgram(
      'export function f() { return <button className="x" onClick={() => {}} />; }',
      'tsx',
    );
    const types: string[] = [];
    walkJsxSurfaceNodes(program, (node) => {
      types.push(node.type);
    });
    expect(types).toEqual(['JSXOpeningElement', 'JSXAttribute', 'JSXAttribute']);
    expect(types).not.toContain('CallExpression');
  });

  describe('astIndex', () => {
    it('caches one index identity per Program and builds once', () => {
      const program = parseProgram('const value = 1;');
      resetAstIndexBuildCount();
      const first = astIndex(program);
      const second = astIndex(program);
      expect(first).toBe(second);
      expect(astIndexBuildStats().builds).toBe(1);
    });

    it('rebuilds after clearAstIndex', () => {
      const program = parseProgram('const value = 1;');
      resetAstIndexBuildCount();
      const first = astIndex(program);
      clearAstIndex(program);
      const second = astIndex(program);
      expect(second).not.toBe(first);
      expect(astIndexBuildStats().builds).toBe(2);
    });

    it('indexes nodes in source order and resolves parents', () => {
      const program = parseProgram('const a = 1; const b = 2;');
      const index = astIndex(program);
      const declarators = index.nodesOfType('VariableDeclarator');
      expect(declarators).toHaveLength(2);
      const firstDecl = declarators[0];
      const secondDecl = declarators[1];
      expect(firstDecl?.type).toBe('VariableDeclarator');
      expect(secondDecl?.type).toBe('VariableDeclarator');
      if (firstDecl?.type !== 'VariableDeclarator' || secondDecl?.type !== 'VariableDeclarator') {
        throw new Error('expected VariableDeclarator nodes');
      }
      expect(firstDecl.id.type).toBe('Identifier');
      expect(secondDecl.id.type).toBe('Identifier');
      if (firstDecl.id.type === 'Identifier' && secondDecl.id.type === 'Identifier') {
        expect(firstDecl.id.name).toBe('a');
        expect(secondDecl.id.name).toBe('b');
      }
      expect(index.parentOf(firstDecl)?.type).toBe('VariableDeclaration');
      expect(index.parentOf(program)).toBeNull();
      const walkOrder = index.nodes().map((node) => node.type);
      expect(walkOrder[0]).toBe('Program');
      expect(walkOrder.indexOf('VariableDeclaration')).toBeLessThan(walkOrder.indexOf('Literal'));
    });

    it('filters type subtrees from the runtime view while keeping them in the full index', () => {
      const program = parseProgram('function f(x: string) { return x; }');
      const index = astIndex(program);
      expect(index.nodesOfType('TSStringKeyword')).toHaveLength(1);
      expect(index.runtimeNodesOfType('TSStringKeyword')).toHaveLength(0);
      expect(index.runtimeNodes().some((node) => node.type === 'TSTypeAnnotation')).toBe(false);
      expect(index.nodes().some((node) => node.type === 'TSTypeAnnotation')).toBe(true);
      expect(index.runtimeNodesOfType('FunctionDeclaration')).toHaveLength(1);
    });

    it('indexes JSX nodes independently of JSX surface helpers', () => {
      const program = parseProgram(
        'export function f() { return <button onClick={() => run()} />; }',
        'tsx',
      );
      const index = astIndex(program);
      expect(index.nodesOfType('JSXElement').length).toBeGreaterThan(0);
      expect(index.nodesOfType('JSXIdentifier').length).toBeGreaterThan(0);
      expect(index.nodesOfType('CallExpression')).toHaveLength(1);
    });

    it('keeps distinct Programs on independent index instances', () => {
      const first = parseProgram('const a = 1;');
      const second = parseProgram('const b = 2;');
      resetAstIndexBuildCount();
      const firstIndex = astIndex(first);
      const secondIndex = astIndex(second);
      expect(firstIndex).not.toBe(secondIndex);
      expect(astIndexBuildStats().builds).toBe(2);
      expect(firstIndex.nodesOfType('Identifier')[0]).not.toBe(
        secondIndex.nodesOfType('Identifier')[0],
      );
    });

    it('routes forEachParamList through the shared Program index', () => {
      const program = parseProgram('function f(x: string | number) {}');
      resetAstIndexBuildCount();
      let seen = 0;
      forEachParamList(program, (params) => {
        expect(params).toHaveLength(1);
        seen += 1;
      });
      expect(seen).toBe(1);
      expect(astIndexBuildStats().builds).toBe(1);
      forEachParamList(program, () => {});
      expect(astIndexBuildStats().builds).toBe(1);
    });
  });

  describe('functionParamVisitors', () => {
    it('registers declare and signature param owners', () => {
      const owners: string[] = [];
      const visitors = functionParamVisitors((_params, owner) => {
        owners.push(owner.type);
      });
      const program = parseProgram(PARAM_OWNERS_FIXTURE);
      const visitorKeys = [
        'ArrowFunctionExpression',
        'FunctionDeclaration',
        'FunctionExpression',
        'TSCallSignatureDeclaration',
        'TSConstructSignatureDeclaration',
        'TSDeclareFunction',
        'TSMethodSignature',
      ] as const;
      walkAst(program, (node) => {
        for (const key of visitorKeys) {
          if (node.type === key) {
            visitors[key](node);
          }
        }
      });
      expect(owners.sort()).toEqual([...visitorKeys].sort());
    });
  });
});
