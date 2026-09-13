import { type ESTree } from '@oxlint/plugins';
import { type Program } from 'oxc-parser';

import { forEachAstChild } from '../oxlint-walk/ast-node-schema.ts';
import {
  astIndex,
  astIndexBuildStats,
  clearAstIndex,
  resetAstIndexBuildCount,
} from '../oxlint-walk/ast-index.ts';
import { isAstNode, walkAst } from '../oxlint-walk/oxlint-walk.ts';
import { parseFixture } from './parse-and-walk.ts';

const fixtureSize = Number(process.argv[2] ?? '10000');
if (!Number.isInteger(fixtureSize) || fixtureSize < 1) {
  throw new Error('Usage: ast-traversal-bench-worker.ts [fixture-size]');
}

const code = Array.from(
  { length: fixtureSize },
  (_, index) =>
    `class Case${index} { value = ${index}; method(input: string) { return input + this.value; } }`,
).join('\n');
function walkProgramRoot(program: Program): ESTree.Node {
  if (!isAstNode(program)) {
    throw new Error('parsed Program is not an AST node');
  }
  return program;
}

const sourceProgram = parseFixture(`/bench/ast-traversal-${fixtureSize}.ts`, code).program;
const root = walkProgramRoot(sourceProgram);
const candidateTypes = [
  'CallExpression',
  'ClassDeclaration',
  'ClassExpression',
  'ImportExpression',
  'TSInterfaceDeclaration',
  'VariableDeclarator',
  'TSIndexedAccessType',
  'ObjectExpression',
  'BinaryExpression',
  'Literal',
  'TemplateLiteral',
] as const;

function directTraversal(): number {
  let count = 0;
  function scan(node: ESTree.Node): void {
    count += 1;
    forEachAstChild(node, (child) => {
      scan(child);
    });
  }
  scan(root);
  return count;
}

function singleWalk(): number {
  let count = 0;
  walkAst(root, () => {
    count += 1;
  });
  return count;
}

function repeatedWalks(): { hits: number; visits: number } {
  let hits = 0;
  let visits = 0;
  for (const type of candidateTypes) {
    walkAst(root, (node) => {
      visits += 1;
      if (node.type === type) {
        hits += 1;
      }
    });
  }
  return { hits, visits };
}

function measure<T>(operation: () => T): { durationMs: number; value: T } {
  const started = performance.now();
  const value = operation();
  return { durationMs: performance.now() - started, value };
}

// One complete warm-up per measured shape. Parsing and warm-up are outside all timings.
directTraversal();
singleWalk();
repeatedWalks();

const direct = measure(directTraversal);
const single = measure(singleWalk);
const repeated = measure(repeatedWalks);
clearAstIndex(sourceProgram);
astIndex(sourceProgram);
clearAstIndex(sourceProgram);
resetAstIndexBuildCount();
const cold = measure(() => astIndex(sourceProgram));
const indexedNodes = cold.value.nodes().length;
for (const type of candidateTypes) {
  void cold.value.nodesOfType(type).length;
}
const hot = measure(() => {
  let hits = 0;
  for (const type of candidateTypes) {
    hits += cold.value.nodesOfType(type).length;
  }
  return hits;
});
const indexBuilds = astIndexBuildStats().builds;

if (
  direct.value !== single.value ||
  repeated.value.visits !== single.value * candidateTypes.length ||
  indexedNodes !== single.value ||
  hot.value !== repeated.value.hits ||
  indexBuilds !== 1
) {
  throw new Error('AST traversal/index invariants did not match');
}

process.stdout.write(
  `${JSON.stringify({
    fixtureSize,
    fixtureBytes: Buffer.byteLength(code),
    astNodes: single.value,
    passes: candidateTypes.length,
    forEachAstChildTraversalMs: direct.durationMs,
    forEachAstChildNodes: direct.value,
    singleWalkMs: single.durationMs,
    singleWalkNodes: single.value,
    repeatedWalkMs: repeated.durationMs,
    repeatedWalkNodes: repeated.value.visits,
    walkHits: repeated.value.hits,
    coldIndexConstructionMs: cold.durationMs,
    hotLookupMs: hot.durationMs,
    indexedNodes,
    indexedHits: hot.value,
    indexBuilds,
  })}\n`,
);
