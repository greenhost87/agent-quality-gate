import { defineRule, type ESTree } from '@oxlint/plugins';

import { collectTypeTables, findHandmadeJsonTypeNames } from './handmade-json-shape.ts';

export const noHandmadeJsonTypes = defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      handmadeType: 'Replace recursive JSON types with v.InferOutput<typeof Schema>.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const tables = collectTypeTables(context.sourceCode.ast);
        const handmade = findHandmadeJsonTypeNames(tables);
        for (const id of handmade.values()) {
          context.report({ node: id, messageId: 'handmadeType' });
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
