import { defineRule, type Context, type ESTree } from '@oxlint/plugins';

import {
  calleeExportName,
  collectValibotBindings,
  isValibotCustomImport,
} from './valibot-bindings.ts';
import type { ValibotBindings } from './valibot-bindings.ts';
import { walkAstSkippingTypeAndJsxMarkup } from '../../../scripts/oxlint-walk/oxlint-walk.ts';

function reportCustomCall(
  context: Context,
  node: ESTree.CallExpression,
  bindings: ValibotBindings,
): void {
  if (calleeExportName(node.callee, bindings) === 'custom') {
    context.report({ node, messageId: 'custom' });
  }
}

function reportCustomImport(context: Context, node: ESTree.ImportDeclaration): void {
  if (typeof node.source.value !== 'string') {
    return;
  }
  for (const specifier of node.specifiers) {
    if (specifier.type !== 'ImportSpecifier') {
      continue;
    }
    if (isValibotCustomImport(specifier, node.source.value)) {
      context.report({ node: specifier, messageId: 'customImport' });
    }
  }
}

export const noValibotCustom = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      custom:
        'Do not use valibot custom schemas. Prefer structural schemas (object, union, lazy, pipe + check).',
      customImport:
        'Do not import custom from valibot. Prefer structural schemas (object, union, lazy, pipe + check).',
    },
  },
  createOnce(context) {
    return {
      before() {
        const bindings = collectValibotBindings(context.sourceCode.ast);
        walkAstSkippingTypeAndJsxMarkup(context.sourceCode.ast, (node) => {
          switch (node.type) {
            case 'CallExpression':
              reportCustomCall(context, node, bindings);
              break;
            case 'ImportDeclaration':
              reportCustomImport(context, node);
              break;
            default:
              break;
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
