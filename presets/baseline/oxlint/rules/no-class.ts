import { defineRule, type ESTree, type Options } from '@oxlint/plugins';
import * as v from 'valibot';

import { walkAst } from 'agent-quality-gate/oxlint-walk';

const SuffixesOptionsSchema = v.object({
  suffixes: v.array(v.unknown()),
});

function readSuffixes(options: Readonly<Options>): readonly string[] | null {
  const parsed = v.safeParse(SuffixesOptionsSchema, options[0]);
  if (!parsed.success) {
    return null;
  }
  const resolved: string[] = [];
  for (const value of parsed.output.suffixes) {
    if (typeof value === 'string') {
      resolved.push(value);
    }
  }
  return resolved;
}

function nameHasSuffix(name: string, suffixes: readonly string[]): boolean {
  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) {
      return true;
    }
  }
  return false;
}

function isAllowedClass(node: ESTree.Class, suffixes: readonly string[]): boolean {
  if (node.declare === true) {
    return true;
  }
  const { superClass } = node;
  if (superClass?.type === 'Identifier' && nameHasSuffix(superClass.name, suffixes)) {
    return true;
  }
  return node.id != null && nameHasSuffix(node.id.name, suffixes);
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          suffixes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    ],
    messages: {
      forbidden:
        'Classes are banned unless the superclass or class name ends with a configured suffix.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const suffixes = readSuffixes(context.options);
        if (suffixes === null) {
          return false;
        }
        walkAst(context.sourceCode.ast, (node) => {
          if (
            (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') &&
            !isAllowedClass(node, suffixes)
          ) {
            context.report({ node, messageId: 'forbidden' });
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
