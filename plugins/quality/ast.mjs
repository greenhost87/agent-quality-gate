export function declarationNode(statement) {
  if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
    return statement.declaration;
  }
  return statement;
}

export function directParameterType(node) {
  const annotation = node.parent;
  if (annotation?.type !== 'TSTypeAnnotation' || annotation.typeAnnotation !== node) {
    return false;
  }
  const parameter = annotation.parent;
  const owner = parameter?.parent;
  return Array.isArray(owner?.params) && owner.params.includes(parameter);
}
