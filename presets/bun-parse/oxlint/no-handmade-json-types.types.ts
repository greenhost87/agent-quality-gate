import type { ESTree } from '@oxlint/plugins';

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
