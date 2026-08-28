export function sourceImportsValibot(text: string): boolean {
  return /from\s+['"]valibot['"]/u.test(text);
}

export function sourceUsesParseJson(text: string): boolean {
  return /\bparseJson\b/u.test(text);
}
