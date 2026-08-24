import {
  collectRepositoryFiles,
  formatPrefixedViolations,
  isInsideProject,
  resolveProjectRoot,
  toProjectRelativePath,
} from './repo-walk.js';
import type { TestColocationViolation } from './test-colocation.types.js';

const TEST_FILE_PATTERN = /\.(?:test|spec|bench)\.(?:[cm]?[jt]sx?)$/u;
const TOP_LEVEL_SUPPORT_REASON =
  'top-level tests/ may only hold shared helpers under tests/support/';
const OWNER_TESTS_REASON =
  'test and bench files must live under adapters/*/tests, scripts/tests, scripts/*/tests, gate/tests, or presets/*/tests';

function fileName(relativePath: string): string {
  const separator = relativePath.lastIndexOf('/');
  return separator === -1 ? relativePath : relativePath.slice(separator + 1);
}

function isAllowedOwnerTestPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  if (segments[0] === 'adapters' && segments[1] !== undefined && segments[2] === 'tests') {
    return true;
  }
  if (segments[0] === 'scripts' && segments[1] === 'tests') {
    return true;
  }
  if (segments[0] === 'scripts' && segments[1] !== undefined && segments[2] === 'tests') {
    return true;
  }
  if (segments[0] === 'gate' && segments[1] === 'tests') {
    return true;
  }
  if (segments[0] === 'presets' && segments[1] !== undefined && segments[2] === 'tests') {
    return true;
  }
  return false;
}

function isTopLevelTestsPath(relativePath: string): boolean {
  return relativePath === 'tests' || relativePath.startsWith('tests/');
}

function isAllowedSupportPath(relativePath: string): boolean {
  return relativePath === 'tests/support' || relativePath.startsWith('tests/support/');
}

function violationForPath(relativePath: string): TestColocationViolation | undefined {
  const isTestFile = TEST_FILE_PATTERN.test(fileName(relativePath));
  if (isTopLevelTestsPath(relativePath)) {
    if (isTestFile || !isAllowedSupportPath(relativePath)) {
      return { path: relativePath, reason: TOP_LEVEL_SUPPORT_REASON };
    }
    return undefined;
  }
  if (isTestFile && !isAllowedOwnerTestPath(relativePath)) {
    return { path: relativePath, reason: OWNER_TESTS_REASON };
  }
  return undefined;
}

function findTestColocationViolations(projectRoot: string): TestColocationViolation[] {
  const root = resolveProjectRoot(projectRoot);
  const files: string[] = [];
  collectRepositoryFiles(root, files);
  const violations: TestColocationViolation[] = [];

  for (const absolutePath of files) {
    if (!isInsideProject(root, absolutePath)) {
      continue;
    }
    const violation = violationForPath(toProjectRelativePath(root, absolutePath));
    if (violation !== undefined) {
      violations.push(violation);
    }
  }

  violations.sort((left, right) => left.path.localeCompare(right.path));
  return violations;
}

export function rejectMisplacedTests(projectRoot: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const violations = findTestColocationViolations(projectRoot);
  return formatPrefixedViolations(
    'test-colocation',
    violations.map((violation) => `${violation.path}: ${violation.reason}`),
  );
}
