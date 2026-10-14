import { expect, test } from 'bun:test';

import { checkResultFromFallowCombinedHygieneToolRun } from '#system/gate/run/fallow/json-diagnostics.ts';
import type { ToolRunResult } from '#system/gate/run/execute-verify.ts';

function combinedRun(check: Record<string, unknown>): ToolRunResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      kind: 'combined',
      check,
      dupes: { clone_groups: [] },
      health: { findings: [] },
    }),
    stderr: '',
  };
}

test('hygiene fails closed when issue totals only have unrecognized findings', () => {
  const result = checkResultFromFallowCombinedHygieneToolRun(
    combinedRun({ total_issues: 2, custom_policy_findings: [{}, {}] }),
  );
  expect(result.exitCode).toBe(1);
  expect(result.failures?.[0]?.message ?? '').toContain(
    'total_issues without recognizable findings',
  );
});

test('manifest-declared external finding keys attribute their issue totals', () => {
  const attributed = checkResultFromFallowCombinedHygieneToolRun(
    combinedRun({ total_issues: 2, custom_policy_findings: [{}, {}] }),
    ['custom_policy_findings'],
  );
  expect(attributed.exitCode).toBe(0);
  expect(attributed.failures).toBeUndefined();
});

test('hygiene reports unattributed totals and accepts a clean total', () => {
  const unattributed = checkResultFromFallowCombinedHygieneToolRun(
    combinedRun({ total_issues: 1 }),
  );
  expect(unattributed.exitCode).toBe(1);
  expect(unattributed.failures?.[0]?.message ?? '').toContain(
    'total_issues without recognizable findings',
  );
  const clean = checkResultFromFallowCombinedHygieneToolRun(combinedRun({ total_issues: 0 }));
  expect(clean.exitCode).toBe(0);
});
