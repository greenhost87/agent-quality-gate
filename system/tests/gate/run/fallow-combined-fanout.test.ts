import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  checkResultFromFallowBoundariesToolRun,
  checkResultFromFallowCombinedBoundariesToolRun,
  checkResultFromFallowCombinedComplexityToolRun,
  checkResultFromFallowCombinedCyclesToolRun,
  checkResultFromFallowCombinedHygieneToolRun,
  checkResultFromFallowComplexityToolRun,
  checkResultFromFallowCyclesToolRun,
  checkResultFromFallowHygieneToolRun,
} from '#system/gate/run/fallow/json-diagnostics.ts';
import { structuralCheckResultFromCombinedToolRun } from '#system/gate/run/fallow/structural-findings.ts';
import type { CheckResult } from '#system/gate/run/check-result.ts';
import { expectVerifyFailureText } from '#system/tests/support/verify-assertions.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  runCleanProjectVerify,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';
import {
  emptyToolResult,
  fallowPhase,
  recordingFallowRunner,
  selfLoopCombinedFailureResult,
  stubVerifyTools,
} from './verify-phases-helpers.ts';

useIsolatedAgentQualityGateHome();
const projects = useExecuteVerifyProjects();

const fixtures = join(import.meta.dir, 'fixtures');

async function golden(name: string): Promise<string> {
  return readFile(join(fixtures, name), 'utf8');
}

function raw(stdout: string, exitCode: number) {
  return { exitCode, stdout, stderr: '' };
}

function bitwiseEqual(left: CheckResult, right: CheckResult): void {
  expect(JSON.stringify(left)).toBe(JSON.stringify(right));
}

const structuralRules = {
  'prop-drilling': 'error',
  'thin-wrapper': 'error',
  'duplicate-prop-shape': 'error',
} as const;

const parityCases: Array<{
  title: string;
  dedicated: string;
  fromCombined: (run: { exitCode: number; stdout: string; stderr: string }) => CheckResult;
  fromDedicated: (run: { exitCode: number; stdout: string; stderr: string }) => CheckResult;
}> = [
  {
    title: 'boundaries fan-out matches the dedicated dead-code run',
    dedicated: 'fallow-boundaries-fanout.json',
    fromCombined: checkResultFromFallowCombinedBoundariesToolRun,
    fromDedicated: checkResultFromFallowBoundariesToolRun,
  },
  {
    title: 'hygiene fan-out matches the dedicated combined run',
    dedicated: 'fallow-hygiene-fanout.json',
    fromCombined: checkResultFromFallowCombinedHygieneToolRun,
    fromDedicated: checkResultFromFallowHygieneToolRun,
  },
  {
    title: 'complexity fan-out matches the dedicated health run',
    dedicated: 'fallow-complexity-fanout.json',
    fromCombined: checkResultFromFallowCombinedComplexityToolRun,
    fromDedicated: checkResultFromFallowComplexityToolRun,
  },
  {
    title: 'cycles fan-out matches the dedicated dead-code run',
    dedicated: 'fallow-cycles-fanout.json',
    fromCombined: checkResultFromFallowCombinedCyclesToolRun,
    fromDedicated: checkResultFromFallowCyclesToolRun,
  },
];

describe('fallow combined fan-out parity (Stage A / V3b)', () => {
  for (const { title, dedicated, fromCombined, fromDedicated } of parityCases) {
    test(title, async () => {
      const combined = await golden('fallow-combined-fanout.json');
      const dedicatedJson = await golden(dedicated);
      bitwiseEqual(fromCombined(raw(combined, 1)), fromDedicated(raw(dedicatedJson, 1)));
    });
  }

  test('structural fan-out matches the dedicated dead-code run', async () => {
    const combined = await golden('fallow-combined-fanout.json');
    const dedicated = await golden('fallow-structural-fanout.json');
    bitwiseEqual(
      structuralCheckResultFromCombinedToolRun(raw(combined, 1), structuralRules),
      structuralCheckResultFromCombinedToolRun(raw(dedicated, 0), structuralRules),
    );
  });

  test('combined exit 1 from ui alone leaves every core phase clean', async () => {
    const combined = await golden('fallow-combined-fanout.json');
    const uiOnly = JSON.stringify({
      ...JSON.parse(combined),
      check: { total_issues: 0 },
      dupes: { clone_groups: [] },
      health: { findings: [] },
    });
    expect(checkResultFromFallowCombinedCyclesToolRun(raw(uiOnly, 1))).toEqual({
      exitCode: 0,
      diagnostics: [],
    });
    expect(checkResultFromFallowCombinedBoundariesToolRun(raw(uiOnly, 1))).toEqual({
      exitCode: 0,
      diagnostics: [],
    });
    expect(checkResultFromFallowCombinedHygieneToolRun(raw(uiOnly, 1))).toEqual({
      exitCode: 0,
      diagnostics: [],
    });
    expect(checkResultFromFallowCombinedComplexityToolRun(raw(uiOnly, 1))).toEqual({
      exitCode: 0,
      diagnostics: [],
    });
    expect(structuralCheckResultFromCombinedToolRun(raw(uiOnly, 1), structuralRules)).toEqual({
      exitCode: 0,
      diagnostics: [],
    });
  });

  for (const scenario of [
    {
      title:
        'green verify spawns combined + stacked ui/dupes fallow runs (no ui without the preset)',
      cyclesFail: false,
    },
    {
      title: 'red cycles report the cycles gate from the shared combined run',
      cyclesFail: true,
    },
  ]) {
    test(scenario.title, async () => {
      const fallowArgv: string[][] = [];
      const { result } = await runCleanProjectVerify(
        projects,
        stubVerifyTools({
          fallow: recordingFallowRunner(fallowArgv, (options) =>
            scenario.cyclesFail
              ? selfLoopCombinedFailureResult()
              : emptyToolResult(options.args, options.name),
          ),
        }),
      );
      if (scenario.cyclesFail) {
        expectVerifyFailureText(result, 're-export-cycle');
        expect(fallowArgv).toHaveLength(1);
        expect(fallowPhase(fallowArgv[0] ?? [])).toBe('combined');
        return;
      }
      expect(result.exitCode).toBe(0);
      expect(fallowArgv).toHaveLength(2);
      expect(fallowArgv.map((args) => fallowPhase(args))).toEqual(['combined', 'dupes']);
      const combinedArgs = fallowArgv[0] ?? [];
      expect(combinedArgs.includes('dead-code')).toBe(false);
      expect(combinedArgs.includes('health')).toBe(false);
      expect(combinedArgs.includes('--fail-on-issues')).toBe(true);
      // Duplication search moved to the third launch: the first launch skips it.
      expect(combinedArgs.includes('--skip')).toBe(true);
      expect(combinedArgs[combinedArgs.indexOf('--skip') + 1]).toBe('dupes');
      const secondArgs = fallowArgv[1] ?? [];
      expect(secondArgs.filter((arg) => arg === '--only')).toHaveLength(1);
      expect(secondArgs).not.toContain('ui');
      expect(secondArgs).toContain('dupes');
    });
  }
});
