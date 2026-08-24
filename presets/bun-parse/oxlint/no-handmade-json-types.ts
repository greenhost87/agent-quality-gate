import { defineRule } from '@oxlint/plugins';

import {
  reportHandmadeFunctionDeclaration,
  reportHandmadeVariableDeclarator,
} from './handmade-json-guards.ts';
import { collectTypeTables, findHandmadeJsonTypeNames } from './handmade-json-shape.ts';

export const noHandmadeJsonTypes = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      handmadeType:
        'Do not invent a recursive JSON type. Parse with Bun + valibot and take types from v.InferOutput.',
      handmadeGuard:
        'Do not invent a plain-object JSON type guard. Parse with Bun + valibot and take types from v.InferOutput.',
    },
  },
  createOnce(context) {
    let handmadeNames: ReadonlySet<string> = new Set();
    return {
      before() {
        const tables = collectTypeTables(context.sourceCode.ast);
        const handmade = findHandmadeJsonTypeNames(tables);
        for (const id of handmade.values()) {
          context.report({ node: id, messageId: 'handmadeType' });
        }
        handmadeNames = new Set(handmade.keys());
      },
      FunctionDeclaration(node) {
        reportHandmadeFunctionDeclaration(context, node, handmadeNames);
      },
      VariableDeclarator(node) {
        reportHandmadeVariableDeclarator(context, node, handmadeNames);
      },
    };
  },
});
