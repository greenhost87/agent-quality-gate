export function sourceImportsValibot(text: string): boolean {
  return /\bvalibot\b/u.test(text);
}

export function sourceUsesParseJson(text: string): boolean {
  return /\bparseJson\b/u.test(text);
}
