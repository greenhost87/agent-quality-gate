const TEST_PATH =
  /(?:^|\/)(?:test|tests|spec|specs|__tests__|e2e)(?:\/|$)|\.(?:test|spec|pw)\.[cm]?[jt]sx?$/u;

/** Whether a Fallow-reported file path is a test source (mirrors test-copy scope). */
export function isTestFilePath(path: string): boolean {
  return TEST_PATH.test(path.replaceAll('\\', '/'));
}
