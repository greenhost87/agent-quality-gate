import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  packageJsonDependencySection,
  readProjectPackageJson,
} from '#system/presets/read-project-package-json.js';
import { opaqueCheckResult, type CheckResult } from '../run/check-result.js';

const REQUIRED_INSTALL_SECTIONS = ['dependencies', 'devDependencies'] as const;

export async function missingInstalledProjectDependencies(projectRoot: string): Promise<string[]> {
  const packageJson = await readProjectPackageJson(projectRoot);
  const declared = new Set(
    REQUIRED_INSTALL_SECTIONS.flatMap((section) =>
      Object.keys(packageJsonDependencySection(packageJson, section) ?? {}),
    ),
  );
  const require = createRequire(join(projectRoot, 'package.json'));
  return [...declared]
    .filter((name) =>
      (require.resolve.paths(name) ?? []).every(
        (modulesPath) => !existsSync(join(modulesPath, name, 'package.json')),
      ),
    )
    .sort();
}

export async function verifyProjectDependenciesInstalled(
  projectRoot: string,
): Promise<CheckResult | undefined> {
  const missing = await missingInstalledProjectDependencies(projectRoot);
  if (missing.length === 0) {
    return undefined;
  }
  return opaqueCheckResult(
    1,
    `verify: project dependencies are not installed\nmissing from node_modules: ${missing.join(', ')}\nrun \`bun install\` in ${projectRoot} before verify\n`,
  );
}
