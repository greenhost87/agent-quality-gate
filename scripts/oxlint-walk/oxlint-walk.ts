import { type ESTree } from '@oxlint/plugins';
import * as v from 'valibot';

import { forEachAstChild, isLooseAstNode, UnknownArraySchema } from './ast-node-schema.ts';

export function isAstNode(value: unknown): value is ESTree.Node {
  return isLooseAstNode(value);
}

export function childNodes(
  node: ESTree.Node,
  options: { skipKeys?: ReadonlySet<string> } = {},
): ESTree.Node[] {
  const children: ESTree.Node[] = [];
  forEachAstChild(
    node,
    (child) => {
      if (isAstNode(child)) {
        children.push(child);
      }
    },
    options,
  );
  return children;
}

export function attachAstParent(node: ESTree.Node, parent: ESTree.Node | null): void {
  Reflect.set(node, 'parent', parent);
}

export function astParentOf(node: ESTree.Node): ESTree.Node | null {
  const parent: unknown = Reflect.get(node, 'parent');
  return isAstNode(parent) ? parent : null;
}

export type WalkAstOptions = {
  skipKeys?: ReadonlySet<string>;
  /** Skip JSX tag/attribute-name markup; still walk `{expression}` and spread args. */
  skipJsxMarkup?: boolean;
};

function jsxOpeningAttributes(
  node: ESTree.JSXElement | ESTree.JSXFragment,
): readonly ESTree.JSXAttributeItem[] {
  if (node.type === 'JSXElement') {
    return node.openingElement.attributes;
  }
  return node.openingFragment.attributes ?? [];
}

/** Expression and nested JSX roots embedded in JSX markup (not tag names or text). */
export function jsxMarkupExpressionRoots(
  node: ESTree.JSXElement | ESTree.JSXFragment,
): ESTree.Node[] {
  const roots: ESTree.Node[] = [];
  for (const attribute of jsxOpeningAttributes(node)) {
    if (attribute.type === 'JSXAttribute') {
      const value = attribute.value;
      if (value?.type === 'JSXExpressionContainer') {
        roots.push(value.expression);
      }
    } else {
      roots.push(attribute.argument);
    }
  }
  for (const child of node.children) {
    if (child.type === 'JSXExpressionContainer') {
      roots.push(child.expression);
    } else if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      roots.push(child);
    }
  }
  return roots;
}

function walkChildren(node: ESTree.Node, options: WalkAstOptions): ESTree.Node[] {
  if (options.skipJsxMarkup && (node.type === 'JSXElement' || node.type === 'JSXFragment')) {
    return jsxMarkupExpressionRoots(node);
  }
  return childNodes(node, options);
}

export function walkAst(
  root: ESTree.Node,
  visit: (node: ESTree.Node, parent: ESTree.Node | null) => void,
  options: WalkAstOptions = {},
): void {
  function scan(node: ESTree.Node, parent: ESTree.Node | null): void {
    visit(node, parent);
    for (const child of walkChildren(node, options)) {
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
    const expression: unknown = Reflect.get(current, 'expression');
    if (!isAstNode(expression)) {
      return current;
    }
    current = expression;
  }
}

const TYPE_SUBTREE_KEYS = new Set(['typeAnnotation', 'returnType', 'typeParameters']);

export function walkAstSkippingTypeSubtrees(
  root: ESTree.Node,
  visit: (node: ESTree.Node, parent: ESTree.Node | null) => void,
): void {
  walkAst(root, visit, { skipKeys: TYPE_SUBTREE_KEYS });
}

export function walkAstSkippingTypeAndJsxMarkup(
  root: ESTree.Node,
  visit: (node: ESTree.Node, parent: ESTree.Node | null) => void,
): void {
  walkAst(root, visit, { skipKeys: TYPE_SUBTREE_KEYS, skipJsxMarkup: true });
}

export function walkJsxSurfaceNodes(
  root: ESTree.Node,
  visit: (node: ESTree.JSXOpeningElement | ESTree.JSXAttribute) => void,
): void {
  function scanJsx(node: ESTree.JSXElement | ESTree.JSXFragment): void {
    if (node.type === 'JSXElement') {
      visit(node.openingElement);
      for (const attribute of node.openingElement.attributes) {
        if (attribute.type === 'JSXAttribute') {
          visit(attribute);
        }
      }
    }
    for (const child of jsxMarkupExpressionRoots(node)) {
      scan(child, node);
    }
  }

  function scan(node: ESTree.Node, _parent: ESTree.Node | null): void {
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      scanJsx(node);
      return;
    }
    for (const child of walkChildren(node, { skipKeys: TYPE_SUBTREE_KEYS })) {
      scan(child, node);
    }
  }

  scan(root, null);
}

export function paramTypeAnnotation(param: ESTree.Node): ESTree.Node | null {
  const annotation: unknown = Reflect.get(param, 'typeAnnotation');
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
  const params: unknown = Reflect.get(node, 'params');
  if (!v.is(UnknownArraySchema, params)) {
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
