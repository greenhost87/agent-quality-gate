import { existsSync, statSync, type Stats } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import type { GlobalProject } from '../global-config/global-config.js';
import { readTextFileSync } from '../../process/files/files.js';
import { canonicalizePath, pathIsInside, selectDeepestRoot } from '../../process/files/paths.js';

function readTrimmedFile(path: string): string | undefined {
  try {
    const contents = readTextFileSync(path).trim();
    return contents.length > 0 ? contents : undefined;
  } catch {
    return undefined;
  }
}

function gitDirFromPointerFile(gitFile: string): string | undefined {
  const contents = readTrimmedFile(gitFile);
  if (contents === undefined) {
    return undefined;
  }
  const match = /^gitdir:\s*(.+)$/m.exec(contents);
  const pointer = match?.[1]?.trim();
  if (pointer === undefined || pointer.length === 0) {
    return undefined;
  }
  return canonicalizePath(isAbsolute(pointer) ? pointer : resolve(dirname(gitFile), pointer));
}

function commonDirForGitDir(gitDir: string): string {
  const relativeCommon = readTrimmedFile(join(gitDir, 'commondir'));
  if (relativeCommon === undefined) {
    return canonicalizePath(gitDir);
  }
  return canonicalizePath(resolve(gitDir, relativeCommon));
}

function checkoutAtGitPath(
  toplevel: string,
  gitPath: string,
): { commonDir: string; toplevel: string } | undefined {
  let gitStat: Stats;
  try {
    gitStat = statSync(gitPath);
  } catch {
    return undefined;
  }
  if (gitStat.isDirectory()) {
    return { commonDir: canonicalizePath(gitPath), toplevel };
  }
  if (!gitStat.isFile()) {
    return undefined;
  }
  const gitDir = gitDirFromPointerFile(gitPath);
  if (gitDir === undefined || !existsSync(gitDir)) {
    return undefined;
  }
  return { commonDir: commonDirForGitDir(gitDir), toplevel };
}

function discoverGitCheckout(start: string): { commonDir: string; toplevel: string } | undefined {
  let current = canonicalizePath(start);
  let previous = '';
  while (current !== previous) {
    const checkout = checkoutAtGitPath(current, join(current, '.git'));
    if (checkout !== undefined) {
      return checkout;
    }
    previous = current;
    current = dirname(current);
  }
  return undefined;
}

export function resolveLinkedCheckoutRoot(cwd: string, configuredRoot: string): string {
  const canonicalRoot = canonicalizePath(configuredRoot);
  const cwdCheckout = discoverGitCheckout(cwd);
  if (cwdCheckout === undefined || cwdCheckout.toplevel === canonicalRoot) {
    return canonicalRoot;
  }
  const rootCheckout = discoverGitCheckout(canonicalRoot);
  if (rootCheckout === undefined || cwdCheckout.commonDir !== rootCheckout.commonDir) {
    return canonicalRoot;
  }
  return cwdCheckout.toplevel;
}

export function findLinkedCheckoutProject(
  cwd: string,
  projects: readonly GlobalProject[],
): GlobalProject | undefined {
  const cwdCheckout = discoverGitCheckout(cwd);
  if (cwdCheckout === undefined) {
    return undefined;
  }
  return selectDeepestRoot(projects, (project) => {
    const rootCheckout = discoverGitCheckout(project.root);
    if (rootCheckout === undefined || cwdCheckout.commonDir !== rootCheckout.commonDir) {
      return false;
    }
    if (!pathIsInside(rootCheckout.toplevel, project.root)) {
      return false;
    }
    const mappedRoot = join(cwdCheckout.toplevel, relative(rootCheckout.toplevel, project.root));
    return pathIsInside(mappedRoot, cwd);
  });
}
