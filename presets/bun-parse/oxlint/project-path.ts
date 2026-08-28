import type { Context } from '@oxlint/plugins';

export function projectPath(context: Context): string {
  const root = context.cwd.replaceAll('\\', '/');
  const filename = context.filename.replaceAll('\\', '/');
  return filename.startsWith(`${root}/`) ? filename.slice(root.length + 1) : filename;
}

export function pathHasPrefix(relativePath: string, prefix: string): boolean {
  return relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix);
}

export function isUnderPathSegment(relativePath: string, segment: string): boolean {
  return (
    relativePath === segment ||
    relativePath.startsWith(`${segment}/`) ||
    relativePath.includes(`/${segment}/`)
  );
}
