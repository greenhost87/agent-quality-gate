import { formatPrefixedViolations } from '../../scripts/self-verify/repo-walk.js';

const TEST_FILE_PATTERN = /\.(?:test|spec|bench)\.(?:[cm]?[jt]sx?)$/u;

const AQG_TOP_LEVEL_SUPPORT_REASON =
  'top-level tests/ may only hold shared helpers under tests/support/';
const AQG_OWNER_TESTS_REASON =
  'test and bench files must live under adapters/*/tests, scripts/tests, scripts/*/tests, gate/tests, presets/*/tests, or presets/*/examples/tests';

const APPLICATION_TESTS_REASON = 'test and bench files must live under tests/';
const APPLICATION_SUPPORT_REASON =
  'top-level tests/ may only hold helpers under tests/support/ or tests/setup/';

const AQG_OWNER_TEST_PATH_PATTERNS = [
  /^adapters\/[^/]+\/tests\//u,
  /^scripts\/tests\//u,
  /^scripts\/[^/]+\/tests\//u,
  /^gate\/tests\//u,
  /^presets\/[^/]+\/tests\//u,
  /^presets\/[^/]+\/examples\/tests\//u,
] as const;

export const TEST_COLOCATION_POLICIES = ['aqg-repository', 'application'] as const;

export type TestColocationPolicy = (typeof TEST_COLOCATION_POLICIES)[number];

export type TestColocationGateConfig = {
  policy: TestColocationPolicy;
};

export type TestColocationViolation = {
  path: string;
  reason: string;
};

function fileName(relativePath: string): string {
  const separator = relativePath.lastIndexOf('/');
  return separator === -1 ? relativePath : relativePath.slice(separator + 1);
}

function isTopLevelTestsPath(relativePath: string): boolean {
  return relativePath === 'tests' || relativePath.startsWith('tests/');
}

function isAllowedSupportPath(relativePath: string): boolean {
  return relativePath === 'tests/support' || relativePath.startsWith('tests/support/');
}

function isAllowedApplicationHelperPath(relativePath: string): boolean {
  return (
    isAllowedSupportPath(relativePath) ||
    relativePath === 'tests/setup' ||
    relativePath.startsWith('tests/setup/')
  );
}

function isAllowedAqgOwnerTestPath(relativePath: string): boolean {
  return AQG_OWNER_TEST_PATH_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function violationForAqgRepositoryPath(relativePath: string): TestColocationViolation | undefined {
  const isTestFile = TEST_FILE_PATTERN.test(fileName(relativePath));
  if (isTopLevelTestsPath(relativePath)) {
    if (isTestFile || !isAllowedSupportPath(relativePath)) {
      return { path: relativePath, reason: AQG_TOP_LEVEL_SUPPORT_REASON };
    }
    return undefined;
  }
  if (isTestFile && !isAllowedAqgOwnerTestPath(relativePath)) {
    return { path: relativePath, reason: AQG_OWNER_TESTS_REASON };
  }
  return undefined;
}

function violationForApplicationPath(relativePath: string): TestColocationViolation | undefined {
  const isTestFile = TEST_FILE_PATTERN.test(fileName(relativePath));
  if (!isTopLevelTestsPath(relativePath)) {
    if (isTestFile) {
      return { path: relativePath, reason: APPLICATION_TESTS_REASON };
    }
    return undefined;
  }
  if (isTestFile) {
    return undefined;
  }
  if (isAllowedApplicationHelperPath(relativePath)) {
    return undefined;
  }
  return { path: relativePath, reason: APPLICATION_SUPPORT_REASON };
}

export function colocationListIgnorePatterns(
  ignorePatterns: readonly string[],
  policy: TestColocationPolicy,
): readonly string[] {
  if (policy !== 'aqg-repository') {
    return ignorePatterns;
  }
  return ignorePatterns.filter((pattern) => pattern !== 'presets/**/*');
}

export function findTestColocationViolationsFromRelativePaths(
  relativePaths: readonly string[],
  policy: TestColocationPolicy,
): TestColocationViolation[] {
  const violations: TestColocationViolation[] = [];
  for (const relativePath of relativePaths) {
    const violation =
      policy === 'application'
        ? violationForApplicationPath(relativePath)
        : violationForAqgRepositoryPath(relativePath);
    if (violation !== undefined) {
      violations.push(violation);
    }
  }
  violations.sort((left, right) => left.path.localeCompare(right.path));
  return violations;
}

export function rejectMisplacedTestsFromRelativePaths(
  relativePaths: readonly string[],
  policy: TestColocationPolicy = 'aqg-repository',
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const violations = findTestColocationViolationsFromRelativePaths(relativePaths, policy);
  return formatPrefixedViolations(
    'test-colocation',
    violations.map((violation) => `${violation.path}: ${violation.reason}`),
  );
}
