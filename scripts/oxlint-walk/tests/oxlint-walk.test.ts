import { describe, expect, it } from 'bun:test';
import { parseSync } from 'oxc-parser';

import {
  eachParamUnion,
  forEachParamList,
  isAstNode,
  nodeParams,
  paramTypeAnnotation,
  paramUnionType,
  unwrapExpression,
  walkAst,
  walkAstSkippingTypeSubtrees,
} from 'agent-quality-gate/oxlint-walk';

function parseProgram(code: string) {
  const parsed = parseSync('fixture.ts', code, {
    lang: 'ts',
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
});
