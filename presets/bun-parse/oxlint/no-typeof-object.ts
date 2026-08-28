import { defineRule, type Context, type ESTree, type Options } from '@oxlint/plugins';
import * as v from 'valibot';

import {
  unwrapExpression,
  walkAstSkippingTypeAndJsxMarkup,
} from '../../../scripts/oxlint-walk/oxlint-walk.ts';
import { isUnderPathSegment, projectPath } from './project-path.ts';
import { isTypeofObjectLiteral } from './typeof-object-sides.ts';

const OBJECT_COMPARE_OPS = new Set(['===', '!==', '==', '!=']);

export const TYPEOF_OBJECT_MODES = ['strict', 'typeof-only', 'off'] as const;

const ModeOptionsSchema = v.object({
  mode: v.optional(v.picklist(TYPEOF_OBJECT_MODES)),
});

function readMode(options: Readonly<Options>): TypeofObjectMode {
  const parsed = v.safeParse(ModeOptionsSchema, options[0]);
  return parsed.success ? (parsed.output.mode ?? 'strict') : 'strict';
}

function isTypeofObjectCompare(node: ESTree.Node): boolean {
  if (node.type !== 'BinaryExpression' || !OBJECT_COMPARE_OPS.has(node.operator)) {
    return false;
  }
  return isTypeofObjectLiteral(node);
}

function isArrayIsArrayCall(node: ESTree.CallExpression): boolean {
  const callee = unwrapExpression(node.callee);
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Array' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'isArray'
  );
}

function identifierName(node: ESTree.Node): string | null {
  const unwrapped = unwrapExpression(node);
  return unwrapped.type === 'Identifier' ? unwrapped.name : null;
}

function typeofObjectIdentifier(node: ESTree.Node): string | null {
  const unwrapped = unwrapExpression(node);
  if (
    unwrapped.type !== 'BinaryExpression' ||
    (unwrapped.operator !== '===' && unwrapped.operator !== '==') ||
    !isTypeofObjectLiteral(unwrapped)
  ) {
    return null;
  }
  const typeofNode = unwrapped.left.type === 'UnaryExpression' ? unwrapped.left : unwrapped.right;
  return typeofNode.type === 'UnaryExpression' ? identifierName(typeofNode.argument) : null;
}

function notNullIdentifier(node: ESTree.Node): string | null {
  const unwrapped = unwrapExpression(node);
  if (
    unwrapped.type !== 'BinaryExpression' ||
    (unwrapped.operator !== '!==' && unwrapped.operator !== '!=')
  ) {
    return null;
  }
  if (unwrapped.left.type === 'Literal' && unwrapped.left.value === null) {
    return identifierName(unwrapped.right);
  }
  if (unwrapped.right.type === 'Literal' && unwrapped.right.value === null) {
    return identifierName(unwrapped.left);
  }
  return null;
}

function notArrayIdentifier(node: ESTree.Node): {
  call: ESTree.CallExpression;
  name: string;
} | null {
  const unwrapped = unwrapExpression(node);
  if (unwrapped.type !== 'UnaryExpression' || unwrapped.operator !== '!') {
    return null;
  }
  const argument = unwrapExpression(unwrapped.argument);
  if (
    argument.type !== 'CallExpression' ||
    !isArrayIsArrayCall(argument) ||
    argument.arguments.length !== 1
  ) {
    return null;
  }
  const name = identifierName(argument.arguments[0]);
  return name == null ? null : { call: argument, name };
}

function flattenLogicalAnd(node: ESTree.Node): ESTree.Node[] {
  const unwrapped = unwrapExpression(node);
  if (unwrapped.type === 'LogicalExpression' && unwrapped.operator === '&&') {
    return [...flattenLogicalAnd(unwrapped.left), ...flattenLogicalAnd(unwrapped.right)];
  }
  return [unwrapped];
}

function notePlainObjectRecipes(
  node: ESTree.LogicalExpression,
  anchors: Set<ESTree.Node>,
  suppressed: Set<ESTree.Node>,
): void {
  const byName = new Map<string, PlainObjectRecipeParts>();
  const partsFor = (name: string): PlainObjectRecipeParts => {
    const existing = byName.get(name);
    if (existing != null) {
      return existing;
    }
    const created: PlainObjectRecipeParts = { arrays: [], nulls: [], typeofs: [] };
    byName.set(name, created);
    return created;
  };
  for (const part of flattenLogicalAnd(node)) {
    const typeofName = typeofObjectIdentifier(part);
    if (typeofName != null && part.type === 'BinaryExpression') {
      partsFor(typeofName).typeofs.push(part);
      continue;
    }
    const nullName = notNullIdentifier(part);
    if (nullName != null) {
      partsFor(nullName).nulls.push(part);
      continue;
    }
    const array = notArrayIdentifier(part);
    if (array != null) {
      partsFor(array.name).arrays.push(array.call);
    }
  }
  for (const recipe of byName.values()) {
    const count = Math.min(recipe.typeofs.length, recipe.nulls.length, recipe.arrays.length);
    for (let index = 0; index < count; index += 1) {
      const anchor = recipe.typeofs[index];
      const array = recipe.arrays[index];
      anchors.add(anchor);
      suppressed.add(anchor);
      suppressed.add(array);
    }
  }
}

function scanTypeofObjectIssues(
  context: Context,
  root: ESTree.Node,
  banArrayIsArray: boolean,
): void {
  const anchors = new Set<ESTree.Node>();
  const suppressed = new Set<ESTree.Node>();

  walkAstSkippingTypeAndJsxMarkup(root, (node) => {
    if (node.type === 'LogicalExpression' && node.operator === '&&') {
      notePlainObjectRecipes(node, anchors, suppressed);
    }
    if (anchors.has(node)) {
      context.report({ node, messageId: 'plainObjectRecipe' });
      return;
    }
    if (suppressed.has(node)) {
      return;
    }
    if (isTypeofObjectCompare(node)) {
      context.report({ node, messageId: 'typeofObject' });
      return;
    }
    if (banArrayIsArray && node.type === 'CallExpression' && isArrayIsArrayCall(node)) {
      context.report({ node, messageId: 'arrayIsArray' });
    }
  });
}

export const noTypeofObject = defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          mode: {
            type: 'string',
            enum: ['strict', 'typeof-only', 'off'],
          },
        },
      },
    ],
    messages: {
      typeofObject: 'Replace typeof … "object" checks with v.parse(Schema, value).',
      arrayIsArray: 'Replace Array.isArray(...) checks with v.parse(Schema, value).',
      plainObjectRecipe: 'Replace plain-object guards with v.parse(Schema, value).',
    },
  },
  createOnce(context) {
    return {
      before() {
        const mode = readMode(context.options);
        if (mode === 'off') {
          return false;
        }
        const relativePath = projectPath(context);
        if (isUnderPathSegment(relativePath, 'tests')) {
          return false;
        }
        const banArrayIsArray = mode === 'strict';
        const source = context.sourceCode.text;
        if (!source.includes('typeof') && (!banArrayIsArray || !source.includes('isArray'))) {
          return false;
        }
        scanTypeofObjectIssues(context, context.sourceCode.ast, banArrayIsArray);
        return false;
      },
      Program() {},
    };
  },
});

export interface PlainObjectRecipeParts {
  arrays: ESTree.CallExpression[];
  nulls: ESTree.Node[];
  typeofs: ESTree.Node[];
}

export type TypeofObjectMode = (typeof TYPEOF_OBJECT_MODES)[number];
