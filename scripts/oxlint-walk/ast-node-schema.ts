import { visitorKeys } from 'oxc-parser';
import * as v from 'valibot';

export const AstNodeSchema = v.looseObject({
  type: v.string(),
});

export const UnknownArraySchema = v.array(v.unknown());

export function isLooseAstNode(value: unknown): value is { type: string } {
  return v.is(AstNodeSchema, value);
}

/** Visit each AST child of `node` using oxc visitor keys. */
export function forEachAstChild(
  node: { type: string },
  visit: (child: { type: string }) => void,
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
