import { defineRule, type Context, type ESTree, type Rule, type Visitor } from '@oxlint/plugins';

import { astParentOf } from 'agent-quality-gate/oxlint-walk';

export type AbsenceReport = {
  messageId: string;
  forms: string;
};

export function absenceForms(
  node: ESTree.Node,
  resolved: WeakMap<ESTree.Node, ReadonlySet<string>>,
): ReadonlySet<string> {
  switch (node.type) {
    case 'TSNullKeyword':
      return new Set(['null']);
    case 'TSUndefinedKeyword':
      return new Set(['undefined']);
    case 'TSVoidKeyword':
      return new Set(['void']);
    default:
      return resolved.get(node) ?? new Set();
  }
}

export function defineNullishAbsenceRule(options: {
  messageId: string;
  message: string;
  allows: (forms: ReadonlySet<string>, node: ESTree.Node) => boolean;
}): Rule {
  return defineRule({
    meta: {
      type: 'problem',
      schema: [],
      messages: { [options.messageId]: options.message },
    },
    createOnce(context) {
      return nullishAbsenceVisitors(context, (forms, node) =>
        options.allows(forms, node)
          ? undefined
          : { messageId: options.messageId, forms: [...forms].sort().join(', ') },
      );
    },
  });
}

/**
 * Shared absence-form traversal for nullish-type rules. `decide` maps the
 * collected forms of one value to a report, or to undefined to allow them.
 */
export function nullishAbsenceVisitors(
  context: Context,
  decide: (forms: ReadonlySet<string>, node: ESTree.Node) => AbsenceReport | undefined,
): Visitor {
  const resolved = new WeakMap<ESTree.Node, ReadonlySet<string>>();

  function check(node: ESTree.Node, forms: ReadonlySet<string>): void {
    resolved.set(node, forms);
    const parent = astParentOf(node);
    // These owners combine the same value's forms on exit. Other type
    // boundaries (objects, arrays, callbacks) must not inherit them.
    if (
      parent?.type === 'TSUnionType' ||
      parent?.type === 'TSParenthesizedType' ||
      parent?.type === 'TSTypeAnnotation' ||
      parent?.type === 'TSOptionalType' ||
      parent?.type === 'TSNamedTupleMember'
    ) {
      return;
    }
    const report = decide(forms, node);
    if (report !== undefined) {
      context.report({ node, messageId: report.messageId, data: { forms: report.forms } });
    }
  }

  return {
    'TSUnionType:exit'(node) {
      check(node, new Set(node.types.flatMap((type) => [...absenceForms(type, resolved)])));
    },
    'TSParenthesizedType:exit'(node) {
      check(node, absenceForms(node.typeAnnotation, resolved));
    },
    'TSTypeAnnotation:exit'(node) {
      const owner = astParentOf(node);
      const forms = new Set(absenceForms(node.typeAnnotation, resolved));
      if (
        owner &&
        (owner.type === 'Identifier' ||
          owner.type === 'TSPropertySignature' ||
          owner.type === 'PropertyDefinition' ||
          owner.type === 'AccessorProperty') &&
        owner.optional === true
      ) {
        forms.add('optional');
      }
      check(node, forms);
    },
    'TSOptionalType:exit'(node) {
      check(node, new Set([...absenceForms(node.typeAnnotation, resolved), 'optional']));
    },
    'TSNamedTupleMember:exit'(node) {
      const forms = new Set(absenceForms(node.elementType, resolved));
      if (node.optional) {
        forms.add('optional');
      }
      check(node, forms);
    },
  };
}
