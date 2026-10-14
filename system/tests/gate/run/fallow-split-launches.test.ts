import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';

import { agentQualityGateHome } from '#system/config/agent-quality-gate-home.ts';
import {
  checkResultFromFallowDupesToolRun,
  combinedDupesSectionFromToolRun,
} from '#system/gate/run/fallow/split-diagnostics.ts';
import {
  fallowCacheConfigEntry,
  isCustomFallowExecutable,
} from '#system/gate/run/verify-tool-run.ts';
import { getOptionalEnv, setEnv } from '#system/gate/read-env/read-env.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  runCleanProjectVerify,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';
import {
  emptyToolResult,
  fallowPhase,
  recordingFallowRunner,
  safeParseFallowRunnerConfig,
  stubVerifyTools,
} from './verify-phases-helpers.ts';

useIsolatedAgentQualityGateHome();
const projects = useExecuteVerifyProjects();
const { createTypeScriptProject, runVerifyWithLauncher } = projects;

function raw(stdout: string, exitCode: number) {
  return { exitCode, stdout, stderr: '' };
}

describe('split fallow launches', () => {
  test('dupes-only envelope exposes clone groups', () => {
    const dupes = {
      clone_groups: [{ instances: [{ file: 'src/a.ts', start_line: 1, end_line: 5 }] }],
    };
    expect(
      combinedDupesSectionFromToolRun(raw(JSON.stringify({ kind: 'combined', dupes }), 1)),
    ).toEqual(dupes);
    expect(
      combinedDupesSectionFromToolRun(
        raw(JSON.stringify({ kind: 'combined', check: { total_issues: 0 } }), 0),
      ),
    ).toBeUndefined();
  });

  const dupesCases = [
    {
      name: 'reports production clone groups',
      instances: [
        { file: 'src/a.ts', start_line: 1, end_line: 5 },
        { file: 'src/b.ts', start_line: 2, end_line: 6 },
      ],
      exitCode: 1,
      ruleIds: ['code-duplication'],
    },
    {
      name: 'ignores small test-only clone groups by default',
      instances: [
        { file: 'tests/a.test.ts', start_line: 1, end_line: 5 },
        { file: 'tests/b.test.ts', start_line: 2, end_line: 6 },
      ],
      exitCode: 0,
      ruleIds: [],
    },
    {
      name: 'reports test-only clone groups over 5 lines',
      instances: [
        { file: 'tests/a.test.ts', start_line: 1, end_line: 10 },
        { file: 'tests/b.test.ts', start_line: 2, end_line: 11 },
      ],
      exitCode: 1,
      ruleIds: ['code-duplication'],
    },
    {
      name: 'keeps mixed production/test clone groups',
      instances: [
        { file: 'src/a.ts', start_line: 1, end_line: 10 },
        { file: 'tests/a.test.ts', start_line: 3, end_line: 12 },
      ],
      exitCode: 1,
      ruleIds: ['code-duplication'],
    },
  ] as const;

  for (const { name, instances, exitCode, ruleIds } of dupesCases) {
    test(`dupes run ${name}`, () => {
      const result = checkResultFromFallowDupesToolRun(
        raw(
          JSON.stringify({
            kind: 'combined',
            dupes: { clone_groups: [{ instances: [...instances] }] },
          }),
          exitCode,
        ),
      );
      expect(result.exitCode).toBe(exitCode);
      expect(result.diagnostics.map((diagnostic) => diagnostic.ruleId)).toEqual([...ruleIds]);
    });
  }

  test('dupes run reports short test-only clones when explicitly enabled', () => {
    const previous = getOptionalEnv('AQG_INCLUDE_SHORT_TEST_DUPLICATES');
    try {
      setEnv('AQG_INCLUDE_SHORT_TEST_DUPLICATES', '1');
      const result = checkResultFromFallowDupesToolRun(
        raw(
          JSON.stringify({
            kind: 'combined',
            dupes: {
              clone_groups: [
                {
                  instances: [
                    { file: 'tests/a.test.ts', start_line: 1, end_line: 5 },
                    { file: 'tests/b.test.ts', start_line: 2, end_line: 6 },
                  ],
                },
              ],
            },
          }),
          1,
        ),
      );
      expect(result.diagnostics.map((diagnostic) => diagnostic.ruleId)).toEqual([
        'code-duplication',
      ]);
    } finally {
      setEnv('AQG_INCLUDE_SHORT_TEST_DUPLICATES', previous);
    }
  });

  test('dupes run crash is a failure, not a pass', () => {
    const result = checkResultFromFallowDupesToolRun(raw('', 2));
    expect(result.exitCode).toBe(2);
  });

  test('cache config entry exists only for the custom fork', () => {
    const home = agentQualityGateHome();
    const customBin = join(home, 'fallow-custom', 'bin', 'fallow');
    const previousFallowPath = getOptionalEnv('FALLOW_PATH');
    try {
      setEnv('FALLOW_PATH', customBin);
      expect(isCustomFallowExecutable()).toBe(true);
      expect(fallowCacheConfigEntry('/tmp/combined')).toEqual({
        cache: { dir: '/tmp/combined' },
      });
      setEnv('FALLOW_PATH', join(home, 'fallow-packaged', 'bin', 'fallow'));
      expect(isCustomFallowExecutable()).toBe(false);
      expect(fallowCacheConfigEntry('/tmp/combined')).toEqual({});
      expect(fallowCacheConfigEntry(undefined)).toEqual({});
    } finally {
      setEnv('FALLOW_PATH', previousFallowPath);
    }
  });

  test('first launch never requests an unsupported ui skip', async () => {
    const home = agentQualityGateHome();
    const previousFallowPath = getOptionalEnv('FALLOW_PATH');
    try {
      for (const fallowPath of [
        join(home, 'fallow-custom', 'bin', 'fallow'),
        join(home, 'fallow-packaged', 'bin', 'fallow'),
      ] as const) {
        setEnv('FALLOW_PATH', fallowPath);
        const fallowArgv: string[][] = [];
        const { result } = await runCleanProjectVerify(
          projects,
          stubVerifyTools({
            fallow: recordingFallowRunner(fallowArgv),
          }),
        );
        expect(result.exitCode).toBe(0);
        const combinedArgs = fallowArgv[0] ?? [];
        expect(fallowPhase(combinedArgs)).toBe('combined');
        const skips: string[] = [];
        for (let index = 0; index < combinedArgs.length; index += 1) {
          if (combinedArgs[index] === '--skip') {
            skips.push(combinedArgs[index + 1] ?? '');
          }
        }
        expect(skips.includes('dupes')).toBe(true);
        expect(skips.includes('ui')).toBe(false);
      }
    } finally {
      setEnv('FALLOW_PATH', previousFallowPath);
    }
  });

  test('dupes launch uses an unscoped cache config', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const fallowArgv: string[][] = [];
    const secondConfigs: Array<{
      production: unknown;
      cacheDir: unknown;
      ignoreDefaults: unknown;
    }> = [];
    const result = await runVerifyWithLauncher(
      cwd,
      stubVerifyTools({
        fallow: recordingFallowRunner(fallowArgv, async (options) => {
          if (fallowPhase(options.args) === 'dupes') {
            const parsed = await safeParseFallowRunnerConfig(
              options.args,
              v.looseObject({
                production: v.optional(v.unknown()),
                cache: v.optional(v.looseObject({ dir: v.optional(v.unknown()) })),
                duplicates: v.optional(v.looseObject({ ignoreDefaults: v.optional(v.unknown()) })),
              }),
            );
            secondConfigs.push(
              parsed.success
                ? {
                    production: parsed.output.production,
                    cacheDir: parsed.output.cache?.dir,
                    ignoreDefaults: parsed.output.duplicates?.ignoreDefaults,
                  }
                : { production: 'unparseable', cacheDir: 'unparseable', ignoreDefaults: false },
            );
          }
          return emptyToolResult(options.args, options.name);
        }),
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(fallowArgv.map((args) => fallowPhase(args))).toEqual(['combined', 'dupes']);
    // One stacked run serves both consumers: test-copies scope
    // (`production: false`, default duplicate ignores off) on the `dupes`
    // cache (the custom fork takes it via `cache.dir`, the packaged binary
    // via `FALLOW_CACHE_DIR`).
    expect(secondConfigs).toEqual([
      {
        production: false,
        cacheDir: isCustomFallowExecutable()
          ? join(cwd, '.aqg', 'cache', 'fallow', 'dupes')
          : undefined,
        ignoreDefaults: false,
      },
    ]);
  });

  test('hygiene merges the dupes launch findings', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const result = await runVerifyWithLauncher(
      cwd,
      stubVerifyTools({
        fallow: (options) => {
          if (fallowPhase(options.args) !== 'dupes') {
            return emptyToolResult(options.args, options.name);
          }
          return {
            exitCode: 1,
            stdout: JSON.stringify({
              kind: 'combined',
              dupes: {
                clone_groups: [
                  {
                    instances: [
                      { file: 'src/a.ts', start_line: 1, end_line: 5 },
                      { file: 'src/b.ts', start_line: 2, end_line: 6 },
                    ],
                  },
                ],
              },
            }),
            stderr: '',
          };
        },
      }),
    );
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics.some((diagnostic) => diagnostic.ruleId === 'code-duplication')).toBe(
      true,
    );
  });
});
