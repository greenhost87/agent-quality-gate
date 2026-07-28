const typeFileNamePattern = /(?:\.types|\.contracts|\.interfaces)\.tsx?$|\/types\.tsx?$/u;
const consoleMethods = new Set(['debug', 'error', 'info', 'log', 'trace', 'warn']);
const placeholderPattern = /%[%sdifjoOc]/gu;
const functionTypes = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

function isTypeOnlyFile(filename) {
  return filename !== '<input>' && filename !== '<text>' && typeFileNamePattern.test(filename.replaceAll('\\', '/'));
}

function isTypeOnlyDeclaration(node) {
  return (
    Boolean(node?.declare) ||
    node?.type === 'TSInterfaceDeclaration' ||
    node?.type === 'TSTypeAliasDeclaration' ||
    node?.type === 'TSModuleDeclaration' ||
    node?.type === 'TSDeclareFunction'
  );
}

function isConsoleMethodCall(node) {
  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'console' &&
    node.callee.property.type === 'Identifier' &&
    consoleMethods.has(node.callee.property.name)
  );
}

function staticStringValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');
  }
  return null;
}

function placeholderCount(format) {
  return Array.from(format.matchAll(placeholderPattern)).filter((match) => match[0] !== '%%').length;
}

function declarationNode(statement) {
  if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
    return statement.declaration;
  }
  return statement;
}

function topLevelTypeDeclaration(statement) {
  const declaration = declarationNode(statement);
  return declaration?.type === 'TSInterfaceDeclaration' || declaration?.type === 'TSTypeAliasDeclaration';
}

function runtimeStatement(statement) {
  if (statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration') {
    return false;
  }
  if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
    return Boolean(statement.declaration) && runtimeStatement(statement.declaration);
  }
  return !topLevelTypeDeclaration(statement);
}

function directParameterType(node) {
  const annotation = node.parent;
  if (annotation?.type !== 'TSTypeAnnotation' || annotation.typeAnnotation !== node) {
    return false;
  }
  const parameter = annotation.parent;
  const owner = parameter?.parent;
  return Array.isArray(owner?.params) && owner.params.includes(parameter);
}

function parameterTypeAnnotation(node) {
  let current = node;
  while (current?.parent) {
    const parent = current.parent;
    if (parent.type === 'TSTypeAnnotation') {
      return directParameterType(parent.typeAnnotation) ? parent : undefined;
    }
    if (functionTypes.has(parent.type) || parent.type === 'TSFunctionType' || parent.type === 'TSMethodSignature') {
      return undefined;
    }
    current = parent;
  }
  return undefined;
}

function belongsToTypePredicate(node) {
  let current = node;
  while (current?.parent) {
    const parent = current.parent;
    if (functionTypes.has(parent.type)) {
      return parent.returnType?.typeAnnotation.type === 'TSTypePredicate';
    }
    current = parent;
  }
  return false;
}

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

const noRuntimeInTypesFiles = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      invalid: 'Type-only files must contain only type imports, type exports, and type declarations.',
    },
  },
  create(context) {
    if (!isTypeOnlyFile(context.filename)) {
      return {};
    }
    return {
      ImportDeclaration(node) {
        if (node.importKind !== 'type') {
          context.report({ node, messageId: 'invalid' });
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') {
          context.report({ node, messageId: 'invalid' });
        }
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind !== 'type' && !isTypeOnlyDeclaration(node.declaration)) {
          context.report({ node, messageId: 'invalid' });
        }
      },
      Program(node) {
        for (const statement of node.body) {
          if (
            statement.type !== 'ImportDeclaration' &&
            statement.type !== 'ExportNamedDeclaration' &&
            statement.type !== 'ExportAllDeclaration' &&
            statement.type !== 'EmptyStatement' &&
            !isTypeOnlyDeclaration(statement)
          ) {
            context.report({ node: statement, messageId: 'invalid' });
          }
        }
      },
    };
  },
};

const typeStyle = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      emptyInterface: 'Do not declare an interface that only extends another type without adding members.',
      mixed: 'Move top-level type declarations into a dedicated type-only file.',
      nullUndefined: 'Do not combine null and undefined in parameter types.',
      singleUse: 'Inline thin function "{{name}}" into its only caller.',
      unknown: 'Do not use unknown in ordinary implementation parameters.',
      uselessAlias: 'Do not export a type alias that only renames another type.',
      wideUnion: 'Do not use wide non-literal union types in parameters.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    return {
      Program(node) {
        if (!isTypeOnlyFile(filename) && node.body.some(runtimeStatement)) {
          for (const statement of node.body.filter(topLevelTypeDeclaration)) {
            context.report({ node: declarationNode(statement), messageId: 'mixed' });
          }
        }
      },
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
      TSUnknownKeyword(node) {
        if (parameterTypeAnnotation(node) && !belongsToTypePredicate(node)) {
          context.report({ node, messageId: 'unknown' });
        }
      },
      TSUnionType(node) {
        if (!directParameterType(node)) {
          return;
        }
        const hasNull = node.types.some((type) => type.type === 'TSNullKeyword');
        const hasUndefined = node.types.some((type) => type.type === 'TSUndefinedKeyword');
        if (hasNull && hasUndefined) {
          context.report({ node, messageId: 'nullUndefined' });
          return;
        }
        const literalTypes = new Set([
          'TSBooleanKeyword',
          'TSLiteralType',
          'TSNullKeyword',
          'TSNumberKeyword',
          'TSStringKeyword',
          'TSUndefinedKeyword',
        ]);
        if (node.types.length > 2 && !node.types.every((type) => literalTypes.has(type.type))) {
          context.report({ node, messageId: 'wideUnion' });
        }
      },
      TSInterfaceDeclaration(node) {
        if (node.extends.length > 0 && node.body.body.length === 0) {
          context.report({ node: node.id, messageId: 'emptyInterface' });
        }
      },
      TSTypeAliasDeclaration(node) {
        if (
          node.parent.type === 'ExportNamedDeclaration' &&
          node.typeAnnotation.type === 'TSTypeReference' &&
          node.typeAnnotation.typeName.type === 'Identifier' &&
          node.typeAnnotation.typeArguments == null
        ) {
          context.report({ node: node.id, messageId: 'uselessAlias' });
        }
      },
    };
  },
};

const consoleFormatPlaceholders = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      dynamic: 'Console output with dynamic values must use format placeholders.',
      mismatch: 'Console format placeholder count must match the dynamic argument count.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isConsoleMethodCall(node)) {
          return;
        }
        if (node.arguments.some((argument) => argument.type === 'TemplateLiteral' && argument.expressions.length > 0)) {
          context.report({ node, messageId: 'dynamic' });
          return;
        }
        if (node.arguments.length <= 1) {
          if (node.arguments[0] && staticStringValue(node.arguments[0]) === null) {
            context.report({ node, messageId: 'dynamic' });
          }
          return;
        }
        const format = staticStringValue(node.arguments[0]);
        if (format === null || placeholderCount(format) !== node.arguments.length - 1) {
          context.report({ node, messageId: 'mismatch' });
        }
      },
    };
  },
};

const qualityPlugin = {
  meta: {
    name: 'quality',
  },
  rules: {
    'console-format-placeholders': consoleFormatPlaceholders,
    'no-runtime-in-types-files': noRuntimeInTypesFiles,
    'type-style': typeStyle,
  },
};

export default qualityPlugin;
