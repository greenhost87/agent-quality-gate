import { type ESTree } from '@oxlint/plugins';
import { visitorKeys } from 'oxc-parser';

function isIndexableObject(value: object): value is { readonly [name: string]: unknown } {
  return typeof value === 'object';
}

function propertyAt(node: object, key: string): unknown {
  if (!isIndexableObject(node)) {
    return undefined;
  }
  return node[key];
}

export function isAstNode(value: unknown): value is ESTree.Node {
  return (
    value != null && typeof value === 'object' && typeof propertyAt(value, 'type') === 'string'
  );
}

export function childNodes(
  node: ESTree.Node,
  options: { skipKeys?: ReadonlySet<string> } = {},
): ESTree.Node[] {
  const skipKeys = options.skipKeys;
  const children: ESTree.Node[] = [];
  const keys: readonly string[] = visitorKeys[node.type] ?? [];
  for (const key of keys) {
    if (skipKeys?.has(key)) {
      continue;
    }
    const value = propertyAt(node, key);
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isAstNode(entry)) {
          children.push(entry);
        }
      }
    } else if (isAstNode(value)) {
      children.push(value);
    }
  }
  return children;
}

export function walkAst(
  root: ESTree.Node,
  visit: (node: ESTree.Node, parent: ESTree.Node | null) => void,
  options: { skipKeys?: ReadonlySet<string> } = {},
): void {
  function scan(node: ESTree.Node, parent: ESTree.Node | null): void {
    visit(node, parent);
    for (const child of childNodes(node, options)) {
      scan(child, node);
    }
  }
  scan(root, null);
}

const EXPRESSION_WRAPPER_TYPES = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);

export function unwrapExpression(node: ESTree.Node): ESTree.Node {
  let current = node;
  for (;;) {
    if (!EXPRESSION_WRAPPER_TYPES.has(current.type)) {
      return current;
    }
    const expression = propertyAt(current, 'expression');
    if (!isAstNode(expression)) {
      return current;
    }
    current = expression;
  }
}

const TYPE_SUBTREE_KEYS = new Set(['typeAnnotation', 'returnType', 'typeParameters']);

export function walkAstSkippingTypeSubtrees(
  root: ESTree.Node,
  visit: (node: ESTree.Node) => void,
): void {
  walkAst(
    root,
    (node) => {
      visit(node);
    },
    { skipKeys: TYPE_SUBTREE_KEYS },
  );
}

export function paramTypeAnnotation(param: ESTree.Node): ESTree.Node | null {
  const annotation = propertyAt(param, 'typeAnnotation');
  if (!isAstNode(annotation) || annotation.type !== 'TSTypeAnnotation') {
    return null;
  }
  return annotation.typeAnnotation;
}

export function paramUnionType(param: ESTree.Node): ESTree.TSUnionType | null {
  const typeNode = paramTypeAnnotation(param);
  return typeNode?.type === 'TSUnionType' ? typeNode : null;
}

export function nodeParams(node: ESTree.Node): readonly ESTree.Node[] | null {
  const params = propertyAt(node, 'params');
  if (!Array.isArray(params)) {
    return null;
  }
  const result: ESTree.Node[] = [];
  for (const param of params) {
    if (isAstNode(param)) {
      result.push(param);
    }
  }
  return result;
}

export function forEachParamList(
  root: ESTree.Node,
  visit: (params: readonly ESTree.Node[]) => void,
): void {
  walkAstSkippingTypeSubtrees(root, (node) => {
    const params = nodeParams(node);
    if (params != null) {
      visit(params);
    }
  });
}

export function eachParamUnion(
  root: ESTree.Node,
  visit: (union: ESTree.TSUnionType) => void,
): void {
  forEachParamList(root, (params) => {
    for (const param of params) {
      const union = paramUnionType(param);
      if (union != null) {
        visit(union);
      }
    }
  });
}

export function paramUnionBeforeVisitors(
  context: {
    sourceCode: { ast: ESTree.Node };
    report: (diagnostic: { node: ESTree.Node; messageId: string }) => void;
  },
  messageId: string,
  matches: (union: ESTree.TSUnionType) => boolean,
): { before: () => false; Program: () => void } {
  return {
    before() {
      eachParamUnion(context.sourceCode.ast, (union) => {
        if (matches(union)) {
          context.report({ node: union, messageId });
        }
      });
      return false;
    },
    Program() {},
  };
}
