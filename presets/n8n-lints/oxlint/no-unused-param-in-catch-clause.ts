import { defineRule, type ESTree } from '@oxlint/plugins';

import { walkAstSkippingTypeSubtrees } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

function isKeyPosition(node: ESTree.Node, parent: ESTree.Node): boolean {
  switch (parent.type) {
    case 'MemberExpression':
      return !parent.computed && parent.property === node;
    case 'Property':
      // `{ key }` shorthand counts as a use via `value`; a pure key does not.
      return parent.key === node && parent.value !== node && !parent.computed;
    case 'MethodDefinition':
    case 'PropertyDefinition':
      return parent.key === node && !parent.computed;
    default:
      return false;
  }
}

function isDeclarationPosition(node: ESTree.Node, parent: ESTree.Node): boolean {
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.id === node;
    case 'CatchClause':
      return parent.param === node;
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return 'label' in parent && parent.label === node;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
      return 'id' in parent && parent.id === node;
    default:
      return false;
  }
}

function isFunctionParam(node: ESTree.Node, parent: ESTree.Node): boolean {
  if (
    parent.type !== 'FunctionDeclaration' &&
    parent.type !== 'FunctionExpression' &&
    parent.type !== 'ArrowFunctionExpression'
  ) {
    return false;
  }
  // `params` is statically an array here; read it without Array.isArray,
  // which the bun-parse house preset bans outside valibot parsing.
  const params = parent.params as readonly unknown[];
  return params.includes(node);
}

function isNonReferencePosition(node: ESTree.Node, parent: ESTree.Node | null): boolean {
  if (parent == null || node.type !== 'Identifier') {
    return false;
  }
  if (
    parent.type === 'ImportSpecifier' ||
    parent.type === 'ImportDefaultSpecifier' ||
    parent.type === 'ImportNamespaceSpecifier'
  ) {
    return true;
  }
  return (
    isKeyPosition(node, parent) ||
    isDeclarationPosition(node, parent) ||
    isFunctionParam(node, parent)
  );
}

function isParamUsed(paramName: string, body: ESTree.Node): boolean {
  let used = false;
  walkAstSkippingTypeSubtrees(body, (child, parent) => {
    if (used || child.type !== 'Identifier' || child.name !== paramName) {
      return;
    }
    if (!isNonReferencePosition(child, parent)) {
      used = true;
    }
  });
  return used;
}

export const noUnusedParamInCatchClause = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      omitUnderscoreParam:
        'Omit the unused catch param; use optional catch binding (`catch {`) instead.',
      unusedParam: 'Catch param is never used; omit it (`catch {`).',
    },
  },
  createOnce(context) {
    return {
      CatchClause(node) {
        if (node.param?.type !== 'Identifier') {
          return;
        }
        if (node.param.name.startsWith('_')) {
          context.report({ node: node.param, messageId: 'omitUnderscoreParam' });
          return;
        }
        if (!isParamUsed(node.param.name, node.body)) {
          context.report({ node: node.param, messageId: 'unusedParam' });
        }
      },
    };
  },
});
