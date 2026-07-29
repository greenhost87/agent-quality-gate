import { declarationNode } from '../ast.mjs';

const functionTypes = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

function addExportedDeclarationNames(names, declaration) {
  if (declaration.type === 'FunctionDeclaration' && declaration.id) {
    names.add(declaration.id.name);
    return;
  }
  if (declaration.type !== 'VariableDeclaration') {
    return;
  }
  for (const item of declaration.declarations) {
    if (item.id.type === 'Identifier') {
      names.add(item.id.name);
    }
  }
}

function collectExportedNames(program) {
  const names = new Set();
  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration) {
      addExportedDeclarationNames(names, statement.declaration);
    }
  }
  return names;
}

function thinForwarder(node) {
  if (node.params.length === 0) {
    return false;
  }
  const body =
    node.body.type === 'BlockStatement' && node.body.body.length === 1 && node.body.body[0]?.type === 'ReturnStatement'
      ? node.body.body[0].argument
      : node.body;
  if (body?.type !== 'CallExpression' || body.arguments.length !== node.params.length) {
    return false;
  }
  return body.arguments.every((argument, index) => {
    const parameter = node.params[index];
    return argument.type === 'Identifier' && parameter?.type === 'Identifier' && argument.name === parameter.name;
  });
}

function localFunctionCandidates(program) {
  const candidates = [];
  const exportedNames = collectExportedNames(program);
  for (const statement of program.body) {
    const declaration = declarationNode(statement);
    if (
      declaration?.type === 'FunctionDeclaration' &&
      declaration.id &&
      !exportedNames.has(declaration.id.name) &&
      thinForwarder(declaration)
    ) {
      candidates.push({ name: declaration.id.name, node: declaration.id });
    }
    if (declaration?.type !== 'VariableDeclaration') {
      continue;
    }
    for (const item of declaration.declarations) {
      if (
        item.id.type === 'Identifier' &&
        item.init &&
        functionTypes.has(item.init.type) &&
        !exportedNames.has(item.id.name) &&
        thinForwarder(item.init)
      ) {
        candidates.push({ name: item.id.name, node: item.id });
      }
    }
  }
  return candidates;
}

function referenceCount(scope, name) {
  const variable = scope.variables.find((item) => item.name === name);
  if (variable) {
    return variable.references.length;
  }
  for (const childScope of scope.childScopes) {
    const count = referenceCount(childScope, name);
    if (count > 0) {
      return count;
    }
  }
  return 0;
}

const noSingleUseForwarders = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      singleUse: 'Inline thin function "{{name}}" into its only caller.',
    },
  },
  create(context) {
    return {
      'Program:exit'(node) {
        const scope = context.sourceCode.getScope(node);
        for (const candidate of localFunctionCandidates(node)) {
          if (referenceCount(scope, candidate.name) === 1) {
            context.report({
              node: candidate.node,
              messageId: 'singleUse',
              data: { name: candidate.name },
            });
          }
        }
      },
    };
  },
};

export default noSingleUseForwarders;
