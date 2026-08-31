import { defineRule, type ESTree, type Options } from '@oxlint/plugins';
import { resolve } from 'node:path';
import * as v from 'valibot';

import { walkAst } from 'agent-quality-gate/oxlint-walk';

const OptionsSchema = v.object({
  allowedFiles: v.optional(v.array(v.pipe(v.string(), v.minLength(1))), []),
});

function readAllowedFiles(options: Readonly<Options>): string[] {
  const parsed = v.safeParse(OptionsSchema, options[0] ?? {});
  return parsed.success ? parsed.output.allowedFiles : [];
}

function isAllowedFile(filename: string, cwd: string, allowedFiles: readonly string[]): boolean {
  const resolvedFilename = resolve(cwd, filename);
  return allowedFiles.some((allowedFile) => resolve(cwd, allowedFile) === resolvedFilename);
}

function isRelativeStringLiteral(node: ESTree.ImportExpression): boolean {
  return (
    node.source.type === 'Literal' &&
    typeof node.source.value === 'string' &&
    (node.source.value.startsWith('./') || node.source.value.startsWith('../'))
  );
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowedFiles: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    ],
    messages: {
      forbidden:
        'Dynamic import() is forbidden. Relative string-literal imports are allowed only in files listed by presetConfig.baseline.literalDynamicImportFiles.',
    },
  },
  createOnce(context) {
    return {
      before() {
        const allowed = isAllowedFile(
          context.filename,
          context.cwd,
          readAllowedFiles(context.options),
        );
        walkAst(context.sourceCode.ast, (node) => {
          if (node.type === 'ImportExpression' && (!allowed || !isRelativeStringLiteral(node))) {
            context.report({ node, messageId: 'forbidden' });
          }
        });
        return false;
      },
      Program() {},
    };
  },
});
