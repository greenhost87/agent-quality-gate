import { defineRule, type ESTree } from '@oxlint/plugins';

import { isStaticString } from '../ast.ts';

function isStringLiteralType(node: ESTree.TSType): boolean {
  return node.type === 'TSLiteralType' && isStaticString(node.literal);
}

function checkExport(
  context: {
    report: (diagnostic: { node: ESTree.Node; messageId: string }) => void;
  },
  node: ESTree.ExportNamedDeclaration,
): void {
  const declaration = node.declaration;
  if (
    declaration?.type === 'TSTypeAliasDeclaration' &&
    declaration.typeAnnotation.type === 'TSUnionType' &&
    declaration.typeAnnotation.types.every(isStringLiteralType)
  ) {
    context.report({ node: declaration.typeAnnotation, messageId: 'manual' });
  }
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      manual:
        'Manual exported string literal unions are forbidden. Export the values as an "as const" tuple and derive the union with "(typeof values)[number]".',
    },
  },
  createOnce(context) {
    function checkProgram(program: ESTree.Program): void {
      for (const statement of program.body) {
        if (statement.type === 'ExportNamedDeclaration') {
          checkExport(context, statement);
        }
      }
    }

    return {
      before() {
        checkProgram(context.sourceCode.ast);
        return false;
      },
      Program() {},
    };
  },
});
