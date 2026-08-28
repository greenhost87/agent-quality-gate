import type { Context, ESTree } from '@oxlint/plugins';

import {
  unwrapExpression,
  walkAstSkippingTypeAndJsxMarkup,
} from '../../../scripts/oxlint-walk/oxlint-walk.ts';
import { collectSchemaConsts, valibotCallName } from './handmade-json-schema.ts';
import {
  collectParseValibotBindings,
  collectSchemaValibotBindings,
  type ParseValibotBindings,
  type SchemaValibotBindings,
} from './valibot-bindings.ts';
import { isValibotParseCall } from './valibot-raw-validation.ts';

const LOOSE_TAIL_SCHEMAS = new Set(['unknown', 'any']);

function pipeStages(pipeCall: ESTree.CallExpression): ESTree.Node[] {
  const stages: ESTree.Node[] = [];
  for (const argument of pipeCall.arguments) {
    if (argument.type === 'SpreadElement') {
      continue;
    }
    const unwrapped = unwrapExpression(argument);
    if (unwrapped.type === 'ArrayExpression') {
      for (const element of unwrapped.elements) {
        if (element != null && element.type !== 'SpreadElement') {
          stages.push(element);
        }
      }
      continue;
    }
    stages.push(unwrapped);
  }
  return stages;
}

function isParseJsonStage(node: ESTree.Node, bindings: SchemaValibotBindings): boolean {
  return valibotCallName(node, bindings) === 'parseJson';
}

function isLooseTailStage(node: ESTree.Node, bindings: SchemaValibotBindings): boolean {
  const name = valibotCallName(node, bindings);
  return name != null && LOOSE_TAIL_SCHEMAS.has(name);
}

function isBareJsonTextPipeCall(
  call: ESTree.CallExpression,
  schemas: ReadonlyMap<string, { init: ESTree.Expression }>,
  bindings: SchemaValibotBindings,
): boolean {
  if (valibotCallName(call, bindings) !== 'pipe') {
    return false;
  }
  const stages = pipeStages(call);
  const parseJsonIndex = stages.findIndex((stage) => isParseJsonStage(stage, bindings));
  if (parseJsonIndex < 0) {
    return false;
  }
  const tail = stages.slice(parseJsonIndex + 1);
  if (tail.length === 0) {
    return true;
  }
  return tail.every((stage) => isLooseTailStage(stage, bindings));
}

export function isBareJsonTextPipeExpr(
  expr: ESTree.Node,
  schemas: ReadonlyMap<string, { init: ESTree.Expression }>,
  bindings: SchemaValibotBindings,
): boolean {
  const unwrapped = unwrapExpression(expr);
  if (unwrapped.type === 'Identifier') {
    const entry = schemas.get(unwrapped.name);
    if (entry == null) {
      return false;
    }
    return isBareJsonTextPipeExpr(entry.init, schemas, bindings);
  }
  if (unwrapped.type !== 'CallExpression') {
    return false;
  }
  return isBareJsonTextPipeCall(unwrapped, schemas, bindings);
}

export function scanBareParseJsonViolations(context: Context, root: ESTree.Program): void {
  const schemaBindings = collectSchemaValibotBindings(root);
  const parseBindings: ParseValibotBindings = collectParseValibotBindings(root);
  const schemas = collectSchemaConsts(root);

  walkAstSkippingTypeAndJsxMarkup(root, (node) => {
    if (node.type !== 'CallExpression' || !isValibotParseCall(node, parseBindings)) {
      return;
    }
    const schemaArg = node.arguments[0];
    if (!isBareJsonTextPipeExpr(schemaArg, schemas, schemaBindings)) {
      return;
    }
    context.report({ node, messageId: 'unvalidatedParseJson' });
  });
}
