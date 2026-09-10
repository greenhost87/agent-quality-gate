import type { Context } from '@oxlint/plugins';

export function normalizedFilename(context: Context): string {
  return context.filename.replaceAll('\\', '/');
}

export function projectPath(context: Context): string {
  const root = context.cwd.replaceAll('\\', '/');
  const filename = normalizedFilename(context);
  return filename.startsWith(`${root}/`) ? filename.slice(root.length + 1) : filename;
}
