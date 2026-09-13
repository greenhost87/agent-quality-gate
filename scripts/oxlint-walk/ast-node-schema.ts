import { type ESTree } from '@oxlint/plugins';
import { visitorKeys } from 'oxc-parser';
import * as v from 'valibot';

export const AstNodeSchema = v.looseObject({
  type: v.string(),
});

export const UnknownArraySchema = v.array(v.unknown());

export function isLooseAstNode(value: unknown): value is ESTree.Node {
  return v.is(AstNodeSchema, value);
}

/** Visit each AST child of `node` using oxc visitor keys. */
export function forEachAstChild(
  node: ESTree.Node,
  visit: (child: ESTree.Node) => void,
  options: { skipKeys?: ReadonlySet<string> } = {},
): void {
  const skipKeys = options.skipKeys;
  const keys: readonly string[] = visitorKeys[node.type] ?? [];
  for (const key of keys) {
    if (skipKeys?.has(key)) {
      continue;
    }
    const value: unknown = Reflect.get(node, key);
    if (v.is(UnknownArraySchema, value)) {
      for (const entry of value) {
        if (isLooseAstNode(entry)) {
          visit(entry);
        }
      }
    } else if (isLooseAstNode(value)) {
      visit(value);
    }
  }
}

function visitAstChildValueWithKey(
  node: ESTree.Node,
  key: string,
  visit: (child: ESTree.Node, key: string) => void,
): void {
  const value: unknown = Reflect.get(node, key);
  if (v.is(UnknownArraySchema, value)) {
    let index = 0;
    while (index < value.length) {
      const entry = value[index];
      if (isLooseAstNode(entry)) {
        visit(entry, key);
      }
      index += 1;
    }
  } else if (isLooseAstNode(value)) {
    visit(value, key);
  }
}

/** Visit each AST child with its owning visitor key when edge metadata is required. */
export function forEachAstChildWithKey(
  node: ESTree.Node,
  visit: (child: ESTree.Node, key: string) => void,
  options: { skipKeys?: ReadonlySet<string> } = {},
): void {
  const keys: readonly string[] = visitorKeys[node.type] ?? [];
  for (const key of keys) {
    if (!options.skipKeys?.has(key)) {
      visitAstChildValueWithKey(node, key, visit);
    }
  }
}
