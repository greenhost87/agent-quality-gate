import { defineRule, type ESTree } from '@oxlint/plugins';

function checkAlias(
  context: {
    report: (diagnostic: { node: ESTree.Node; messageId: string }) => void;
  },
  node: ESTree.TSTypeAliasDeclaration,
): void {
  if (
    node.parent.type === 'ExportNamedDeclaration' &&
    node.typeAnnotation.type === 'TSTypeReference' &&
    node.typeAnnotation.typeName.type === 'Identifier' &&
    node.typeAnnotation.typeArguments == null
  ) {
    context.report({ node: node.id, messageId: 'uselessAlias' });
  }
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      uselessAlias: 'Do not export a type alias that only renames another type.',
    },
  },
  createOnce(context) {
    function checkProgram(program: ESTree.Program): void {
      for (const statement of program.body) {
        if (
          statement.type === 'ExportNamedDeclaration' &&
          statement.declaration?.type === 'TSTypeAliasDeclaration'
        ) {
          // Parent is set by the parser / prior walks in real oxlint; for the
          // harness scan, attach it so the same parent check applies.
          statement.declaration.parent = statement;
          checkAlias(context, statement.declaration);
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
