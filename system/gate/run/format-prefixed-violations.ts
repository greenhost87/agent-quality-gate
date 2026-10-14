import type { CheckResult } from './check-result.js';

export function formatPrefixedViolations(prefix: string, lines: readonly string[]): CheckResult {
  if (lines.length === 0) {
    return { exitCode: 0, diagnostics: [] };
  }
  const source = prefix.split('/')[0] ?? 'preset';
  return {
    exitCode: 1,
    diagnostics: lines.map((line) => {
      const match = /^([^:]+): (.+)$/u.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        return {
          source,
          ruleId: prefix,
          severity: 'error' as const,
          message: match[2],
          location: { path: match[1] },
          groupHeader: prefix,
        };
      }
      return {
        source,
        ruleId: prefix,
        severity: 'error' as const,
        message: line,
        groupHeader: prefix,
      };
    }),
  };
}
