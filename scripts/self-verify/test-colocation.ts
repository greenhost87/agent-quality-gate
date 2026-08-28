import {
  collectRepositoryFiles,
  formatPrefixedViolations,
  isInsideProject,
  resolveProjectRoot,
  toProjectRelativePath,
} from './repo-walk.js';

const TEST_FILE_PATTERN = /\.(?:test|spec|bench)\.(?:[cm]?[jt]sx?)$/u;
const TOP_LEVEL_SUPPORT_REASON =
  'top-level tests/ may only hold shared helpers under tests/support/';
const OWNER_TESTS_REASON =
  'test and bench files must live under adapters/*/tests, scripts/tests, scripts/*/tests, gate/tests, presets/*/tests, or presets/*/examples/tests';

function fileName(relativePath: string): string {
  const separator = relativePath.lastIndexOf('/');
  return separator === -1 ? relativePath : relativePath.slice(separator + 1);
}

const OWNER_TEST_PATH_PATTERNS = [
  /^adapters\/[^/]+\/tests\//u,
  /^scripts\/tests\//u,
  /^scripts\/[^/]+\/tests\//u,
  /^gate\/tests\//u,
  /^presets\/[^/]+\/tests\//u,
  /^presets\/[^/]+\/examples\/tests\//u,
] as const;

function isAllowedOwnerTestPath(relativePath: string): boolean {
  return OWNER_TEST_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
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

export type TestColocationViolation = {
  path: string;
  reason: string;
};
