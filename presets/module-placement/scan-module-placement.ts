import { posix } from 'node:path';

const TYPESCRIPT_MODULE_PATTERN = /\.tsx?$/u;
const TYPESCRIPT_STRING_LITERAL_PATTERN = /(['"])([^'"]+\.tsx?)\1/gu;

export function findDirectoryCapacityViolations(
  relativePaths: readonly string[],
  limits: Readonly<Record<string, number>>,
): DirectoryCapacityViolation[] {
  const counts = new Map<
    string,
    { directory: string; files: Set<string>; limit: number; root: string }
  >();
  for (const [root, limit] of Object.entries(limits)) {
    const prefix = `${root}/`;
    for (const path of relativePaths) {
      if (!path.startsWith(prefix) || !TYPESCRIPT_MODULE_PATTERN.test(path)) {
        continue;
      }
      const separator = path.lastIndexOf('/');
      if (separator === -1) {
        continue;
      }
      const directory = path.slice(0, separator);
      const key = `${root}\0${directory}`;
      const count = counts.get(key) ?? { directory, files: new Set<string>(), limit, root };
      count.files.add(path);
      counts.set(key, count);
    }
  }
  return [...counts.values()]
    .filter((count) => count.files.size > count.limit)
    .map((count) => ({
      count: count.files.size,
      directory: count.directory,
      limit: count.limit,
      root: count.root,
    }))
    .sort((left, right) => left.directory.localeCompare(right.directory));
}

export function routeModuleReferences(source: string, root: string, manifest: string): Set<string> {
  const references = new Set<string>();
  for (const match of source.matchAll(TYPESCRIPT_STRING_LITERAL_PATTERN)) {
    const specifier = match[2].replaceAll('\\', '/').replace(/^\.\//u, '');
    const projectPath = posix.normalize(posix.join(posix.dirname(manifest), specifier));
    if (projectPath.startsWith(`${root}/`)) {
      references.add(projectPath);
    }
  }
  return references;
}

export function findRouteCompositionViolations(
  relativePaths: readonly string[],
  policies: readonly RouteCompositionPolicy[],
): RouteCompositionViolation[] {
  const violations: RouteCompositionViolation[] = [];
  for (const policy of policies) {
    const prefix = `${policy.root}/`;
    for (const path of relativePaths) {
      if (
        path.startsWith(prefix) &&
        TYPESCRIPT_MODULE_PATTERN.test(path) &&
        !policy.routeModules.has(path)
      ) {
        violations.push({
          manifest: policy.manifest,
          path,
          presentationRoot: policy.presentationRoot,
          root: policy.root,
        });
      }
    }
  }
  return violations.sort((left, right) => left.path.localeCompare(right.path));
}

export type DirectoryCapacityViolation = {
  count: number;
  directory: string;
  limit: number;
  root: string;
};

export type RouteCompositionPolicy = {
  manifest: string;
  presentationRoot: string;
  root: string;
  routeModules: ReadonlySet<string>;
};

export type RouteCompositionViolation = {
  manifest: string;
  path: string;
  presentationRoot: string;
  root: string;
};
