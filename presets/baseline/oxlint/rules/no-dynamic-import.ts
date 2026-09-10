import { defineRule, type ESTree, type Options } from '@oxlint/plugins';
import { resolve } from 'node:path';
import * as v from 'valibot';

import { createOptionsRefCache } from '../../../../scripts/oxlint-options-ref-cache/options-ref-cache.ts';

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
    const allowedFilesCache = createOptionsRefCache(readAllowedFiles);
    let allowed = false;
    return {
      before() {
        allowed = isAllowedFile(
          context.filename,
          context.cwd,
          allowedFilesCache.get(context.options),
        );
      },
      ImportExpression(node) {
        if (!allowed || !isRelativeStringLiteral(node)) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
});
