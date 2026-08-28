export function readPackageObject(parsed: unknown): object {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed;
}
