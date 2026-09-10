import { defineRule } from '@oxlint/plugins';

import { createMaxOptionReader } from '../max-option.ts';

const readMax = createMaxOptionReader(400, 0);

type SourceRange = readonly [number, number];

function countCodeLines(text: string, excluded: SourceRange[]): number {
  excluded.sort((left, right) => left[0] - right[0]);
  const parts: string[] = [];
  let cursor = 0;
  for (const [start, end] of excluded) {
    if (end <= cursor) continue;
    parts.push(text.slice(cursor, Math.max(cursor, start)));
    parts.push(text.slice(Math.max(cursor, start), end).replace(/[^\r\n\u2028\u2029]/gu, ''));
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return parts
    .join('')
    .split(/\r\n|[\r\n\u2028\u2029]/u)
    .filter((line) => line.trim().length > 0).length;
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: { max: { type: 'integer', minimum: 0 } },
      },
    ],
    messages: {
      tooManyLines:
        'File has {{count}} code lines; maximum is {{max}}. Imports, comments, and blank lines are excluded.',
    },
  },
  createOnce(context) {
    return {
      Program(node) {
        const max = readMax(context.options);
        const excluded: SourceRange[] = context.sourceCode
          .getAllComments()
          .map((comment) => comment.range);
        for (const statement of node.body) {
          if (
            statement.type === 'ImportDeclaration' ||
            statement.type === 'TSImportEqualsDeclaration'
          ) {
            excluded.push(statement.range);
          }
        }
        const count = countCodeLines(context.sourceCode.text, excluded);
        if (count > max) {
          context.report({ node, messageId: 'tooManyLines', data: { count, max } });
        }
      },
    };
  },
});
