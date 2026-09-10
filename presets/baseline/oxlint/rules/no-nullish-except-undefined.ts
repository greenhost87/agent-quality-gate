import type { ESTree } from '@oxlint/plugins';
import { astParentOf } from 'agent-quality-gate/oxlint-walk';

import { defineNullishAbsenceRule } from '../nullish-absence.ts';

export default defineNullishAbsenceRule({
  messageId: 'nonUndefinedAbsence',
  message:
    'Only `T | undefined` absence or standalone `void` returns are allowed, found: {{forms}}.',
  allows: (forms, node) =>
    !forms.has('null') &&
    !forms.has('optional') &&
    (!forms.has('void') || isStandaloneVoidReturn(node)),
});

function isStandaloneVoidReturn(node: ESTree.Node): boolean {
  if (node.type !== 'TSTypeAnnotation') {
    return false;
  }
  const owner = astParentOf(node);
  if (!owner || !('returnType' in owner) || owner.returnType !== node) {
    return false;
  }
  let type = node.typeAnnotation;
  while (type.type === 'TSParenthesizedType') {
    type = type.typeAnnotation;
  }
  return type.type === 'TSVoidKeyword';
}
