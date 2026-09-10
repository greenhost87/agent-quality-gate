import { type ESTree } from '@oxlint/plugins';
import * as v from 'valibot';

import { AstNodeSchema, forEachAstChild } from './ast-node-schema.ts';

const TYPE_SUBTREE_KEYS = new Set(['typeAnnotation', 'returnType', 'typeParameters']);
const EMPTY_NODES: readonly ESTree.Node[] = Object.freeze([]);
/** Attached to each Program so separately bundled presets share one index. */
const AST_INDEX_PROP = Symbol.for('agent-quality-gate.astIndex');

export type AstIndex = {
  /** All nodes in source (preorder) visit order. */
  nodes(): readonly ESTree.Node[];
  /** Nodes of `type` in source visit order. */
  nodesOfType(type: string): readonly ESTree.Node[];
  /** Runtime nodes in source order (typeAnnotation / returnType / typeParameters subtrees omitted). */
  runtimeNodes(): readonly ESTree.Node[];
  /** Runtime nodes of `type` in source visit order. */
  runtimeNodesOfType(type: string): readonly ESTree.Node[];
  parentOf(node: ESTree.Node): ESTree.Node | null;
};

let buildCount = 0;

export function astIndexBuildStats(): { builds: number } {
  return { builds: buildCount };
}

export function resetAstIndexBuildCount(): void {
  buildCount = 0;
}

function isProgramAstNode(value: unknown): value is ESTree.Node {
  return v.is(AstNodeSchema, value);
}

const CachedAstIndexSchema = v.object({
  nodesOfType: v.function(),
  runtimeNodes: v.function(),
  parentOf: v.function(),
});

function isCachedAstIndex(value: unknown): value is AstIndex {
  return v.is(CachedAstIndexSchema, value);
}

function pushByType(map: Map<string, ESTree.Node[]>, node: ESTree.Node): void {
  const list = map.get(node.type);
  if (list === undefined) {
    map.set(node.type, [node]);
    return;
  }
  list.push(node);
}

function buildAstIndex(program: ESTree.Node): AstIndex {
  buildCount += 1;

  const nodes: ESTree.Node[] = [];
  const runtimeNodes: ESTree.Node[] = [];
  const byType = new Map<string, ESTree.Node[]>();
  const runtimeByType = new Map<string, ESTree.Node[]>();
  const parents = new WeakMap<object, ESTree.Node | null>();

  function scan(node: ESTree.Node, parent: ESTree.Node | null, runtime: boolean): void {
    parents.set(node, parent);
    nodes.push(node);
    pushByType(byType, node);
    if (runtime) {
      runtimeNodes.push(node);
      pushByType(runtimeByType, node);
    }

    forEachAstChild(node, (child, key) => {
      if (!isProgramAstNode(child)) {
        return;
      }
      scan(child, node, runtime && !TYPE_SUBTREE_KEYS.has(key));
    });
  }

  scan(program, null, true);

  return {
    nodes() {
      return nodes;
    },
    nodesOfType(type) {
      return byType.get(type) ?? EMPTY_NODES;
    },
    runtimeNodes() {
      return runtimeNodes;
    },
    runtimeNodesOfType(type) {
      return runtimeByType.get(type) ?? EMPTY_NODES;
    },
    parentOf(node) {
      return parents.get(node) ?? null;
    },
  };
}

/**
 * Lazy per-`Program` AST index.
 * Cached on the Program via `Symbol.for` so separately bundled oxlint presets
 * reuse one index for the same AST object.
 */
export function astIndex(program: { type: 'Program' }): AstIndex {
  const cached: unknown = Reflect.get(program, AST_INDEX_PROP);
  if (isCachedAstIndex(cached)) {
    return cached;
  }
  if (!isProgramAstNode(program)) {
    throw new Error('astIndex requires an AST Program');
  }
  const built = buildAstIndex(program);
  Reflect.set(program, AST_INDEX_PROP, built);
  return built;
}
