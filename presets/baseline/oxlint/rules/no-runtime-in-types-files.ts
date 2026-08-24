import { defineRule, type ESTree } from '@oxlint/plugins';

import { isReadonlyStringLiteralCatalog } from '../ast.ts';
import { isTypeOnlyFile } from '../type-only-files.ts';

function isExportedReadonlyStringLiteralCatalog(node: ESTree.ExportNamedDeclaration): boolean {
  const declaration = node.declaration;
  return (
    declaration?.type === 'VariableDeclaration' &&
    declaration.kind === 'const' &&
    declaration.declarations.every(
      (item) =>
        item.id.type === 'Identifier' &&
        item.id.typeAnnotation == null &&
        isReadonlyStringLiteralCatalog(item.init),
    )
  );
}

function isTypeOnlyDeclaration(node: ESTree.Node | null): boolean {
  if (node == null) {
    return false;
  }
  if ('declare' in node && Boolean(node.declare)) {
    return true;
  }
  switch (node.type) {
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSModuleDeclaration':
    case 'TSDeclareFunction':
      return true;
    default:
      return false;
  }
}

function isPermittedTypeFileStatement(statement: ESTree.Directive | ESTree.Statement): boolean {
  switch (statement.type) {
    case 'ImportDeclaration':
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
    case 'ExportDefaultDeclaration':
    case 'EmptyStatement':
      return true;
    default:
      return isTypeOnlyDeclaration(statement);
  }
}

function checkImportExport(
  context: {
    report: (diagnostic: { node: ESTree.Node; messageId: string }) => void;
  },
  statement: ESTree.Directive | ESTree.Statement,
): void {
  switch (statement.type) {
    case 'ImportDeclaration':
      if (statement.importKind !== 'type') {
        context.report({ node: statement, messageId: 'invalid' });
      }
      break;
    case 'ExportAllDeclaration':
      if (statement.exportKind !== 'type') {
        context.report({ node: statement, messageId: 'invalid' });
      }
      break;
    case 'ExportDefaultDeclaration':
      if (!isTypeOnlyDeclaration(statement.declaration)) {
        context.report({ node: statement, messageId: 'invalid' });
      }
      break;
    case 'ExportNamedDeclaration':
      if (
        statement.exportKind !== 'type' &&
        !isTypeOnlyDeclaration(statement.declaration) &&
        !isExportedReadonlyStringLiteralCatalog(statement)
      ) {
        context.report({ node: statement, messageId: 'invalid' });
      }
      break;
    default:
      break;
  }
}

export default defineRule({
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      invalid:
        'Dedicated type files may contain only type imports, type exports, type declarations, and exported unannotated "as const" string literal catalogs.',
    },
  },
  createOnce(context) {
    function checkProgram(node: ESTree.Program): void {
      for (const statement of node.body) {
        if (!isPermittedTypeFileStatement(statement)) {
          context.report({ node: statement, messageId: 'invalid' });
        }
        checkImportExport(context, statement);
      }
    }

    return {
      // Top-level scan only; skip the visitor walk after reporting.
      before() {
        if (!isTypeOnlyFile(context.filename)) {
          return false;
        }
        checkProgram(context.sourceCode.ast);
        return false;
      },
      Program() {},
    };
  },
});
