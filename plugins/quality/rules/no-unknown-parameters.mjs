import { directParameterType } from '../ast.mjs';

const functionTypes = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);

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

const noUnknownParameters = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      unknown: 'Do not use unknown in ordinary implementation parameters.',
    },
  },
  create(context) {
    return {
      TSUnknownKeyword(node) {
        if (parameterTypeAnnotation(node) && !belongsToTypePredicate(node)) {
          context.report({ node, messageId: 'unknown' });
        }
      },
    };
  },
};

export default noUnknownParameters;
