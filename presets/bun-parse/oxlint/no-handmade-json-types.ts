import { defineRule, type ESTree } from '@oxlint/plugins';

import { findHandmadeJsonExportedReturns } from './handmade-export-returns.ts';
import { findHandmadeJsonSchemaNames } from './handmade-json-schema.ts';
import { collectTypeTables, findHandmadeJsonTypeNames } from './handmade-json-shape.ts';

export const noHandmadeJsonTypes = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      handmadeType: 'Replace generic JSON types and schemas with v.InferOutput<typeof Schema>.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const program = context.sourceCode.ast;
        const sourceText = context.sourceCode.text;
        const tables = collectTypeTables(program);
        const reported = new Set<ESTree.Node>();
        const report = (node: ESTree.Node): void => {
          if (reported.has(node)) {
            return;
          }
          reported.add(node);
          context.report({ node, messageId: 'handmadeType' });
        };
        for (const id of findHandmadeJsonTypeNames(tables).values()) {
          report(id);
        }
        for (const id of findHandmadeJsonSchemaNames(program, sourceText).values()) {
          report(id);
        }
        for (const id of findHandmadeJsonExportedReturns(program, tables, sourceText).values()) {
          report(id);
        }
        return false;
      },
      Program() {},
    };
  },
});

export type TypeAliasEntry = {
  id: ESTree.BindingIdentifier;
  annotation: ESTree.TSType;
};

export type InterfaceEntry = {
  id: ESTree.BindingIdentifier;
  body: ESTree.TSInterfaceBody;
};

export type TypeTables = {
  aliases: Map<string, TypeAliasEntry>;
  interfaces: Map<string, InterfaceEntry>;
};

export type UnionShape = {
  handmade: boolean;
  partners: Set<string>;
};
