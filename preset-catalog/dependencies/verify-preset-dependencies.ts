import { semver } from 'bun';
import * as v from 'valibot';

import type {
  PresetDependencyResult,
  PresetDependencyViolation,
  PresetIgnoreScriptsViolation,
  PresetProjectDependency,
} from '../contract/preset-contract.types.js';
import type { PresetDependencySection } from '../contract/preset-dependency-sections.js';
import {
  packageJsonDependencySection,
  readProjectPackageJson,
  type ProjectPackageJson,
} from './read-project-package-json.js';

function rangeAdmitsVersion(range: string, version: string): boolean {
  return semver.satisfies(version, range);
}

function verifyIgnoreScripts(
  packageJson: ProjectPackageJson | undefined,
  required: readonly string[],
): PresetIgnoreScriptsViolation[] {
  if (required.length === 0) {
    return [];
  }
  if (packageJson === undefined || !Object.hasOwn(packageJson, 'ignoreScripts')) {
    return [{ required: [...required], actual: undefined, reason: 'missing-field' }];
  }
  const parsed = v.safeParse(v.array(v.string()), packageJson.ignoreScripts);
  if (!parsed.success) {
    return [{ required: [...required], actual: undefined, reason: 'invalid-field' }];
  }
  const missing = required.filter((name) => !parsed.output.includes(name));
  if (missing.length > 0) {
    return [{ required: missing, actual: parsed.output, reason: 'missing-entries' }];
  }
  return [];
}

/** Read-only package.json check. Never mutates the project package.json. */
export async function verifyPresetDependencies(
  projectRoot: string,
  dependencies: readonly PresetProjectDependency[],
  ignoreScripts: readonly string[] = [],
): Promise<PresetDependencyResult> {
  const packageJson = await readProjectPackageJson(projectRoot);
  const violations: PresetDependencyViolation[] = [];

  for (const dependency of dependencies) {
    const section = packageJsonDependencySection(packageJson, dependency.section);
    if (section === undefined) {
      violations.push({
        name: dependency.name,
        section: dependency.section,
        requiredVersion: dependency.version,
        actualRange: undefined,
        reason: 'missing-section',
      });
      continue;
    }
    const actual = section[dependency.name];
    if (actual === undefined) {
      violations.push({
        name: dependency.name,
        section: dependency.section,
        requiredVersion: dependency.version,
        actualRange: undefined,
        reason: 'missing-dependency',
      });
      continue;
    }
    if (!rangeAdmitsVersion(actual, dependency.version)) {
      violations.push({
        name: dependency.name,
        section: dependency.section,
        requiredVersion: dependency.version,
        actualRange: actual,
        reason: 'incompatible-range',
      });
    }

    const oppositeSection: PresetDependencySection =
      dependency.section === 'devDependencies' ? 'dependencies' : 'devDependencies';
    const oppositeObject = packageJsonDependencySection(packageJson, oppositeSection);
    const oppositeRange = oppositeObject?.[dependency.name];
    if (oppositeRange !== undefined) {
      violations.push({
        name: dependency.name,
        section: dependency.section,
        requiredVersion: dependency.version,
        actualRange: oppositeRange,
        reason: 'leaked-section',
      });
    }
  }

  const ignoreScriptsViolations = verifyIgnoreScripts(packageJson, ignoreScripts);
  return {
    ok: violations.length === 0 && ignoreScriptsViolations.length === 0,
    violations,
    ignoreScriptsViolations,
  };
}

export function formatDependencyViolations(
  violations: readonly PresetDependencyViolation[],
): string {
  return violations
    .map((violation) => {
      if (violation.reason === 'missing-section') {
        return `preset dependency ${violation.name}@${violation.requiredVersion} requires package.json "${violation.section}"`;
      }
      if (violation.reason === 'missing-dependency') {
        return `preset dependency ${violation.name}@${violation.requiredVersion} is missing from package.json "${violation.section}"`;
      }
      if (violation.reason === 'leaked-section') {
        const oppositeSection =
          violation.section === 'devDependencies' ? 'dependencies' : 'devDependencies';
        return `preset dependency ${violation.name} belongs in "${violation.section}" but also appears in "${oppositeSection}"`;
      }
      return `preset dependency ${violation.name}@${violation.requiredVersion} is incompatible with declared range "${violation.actualRange ?? ''}" in "${violation.section}"`;
    })
    .join('\n');
}

export function formatIgnoreScriptsViolations(
  violations: readonly PresetIgnoreScriptsViolation[],
): string {
  return violations
    .map((violation) => {
      const required = violation.required.join(', ');
      if (violation.reason === 'missing-field') {
        return `preset package.json "ignoreScripts" is missing; required entries: ${required}`;
      }
      if (violation.reason === 'invalid-field') {
        return `preset package.json "ignoreScripts" must be an array of package names; required entries: ${required}`;
      }
      return `preset package.json "ignoreScripts" is missing required entries: ${required}`;
    })
    .join('\n');
}
