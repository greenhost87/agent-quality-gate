import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';

import { packagedAssetsDirectory } from '#system/config/packaged-assets/packaged-assets.ts';
import { readOxlintConfig } from '#system/config/verify-config-files/verify-config-files.ts';
import { readJsonFile, readTextFile, writeTextFile } from '#system/process/files/files.ts';
import { executeVerify } from '#system/gate/run/execute-verify.ts';
import { TYPE_AWARE_OXLINT_TIMEOUT_MS } from '#system/config/tuning/tuning.ts';
import { oxlintTypeAwareEnabled } from '#system/presets/write-oxlint-config.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  executeVerifyDatabasePreset,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';
import {
  configArgOf,
  emptyToolResult,
  expectEphemeralCleanedUp,
  ephemeralConfigDirs,
  fallowCombinedFailureResult,
  fallowConfigRules,
  fallowPhase,
  oxlintClassFoundDiagnostic,
  oxlintFailureResult,
  oxlintJsonDiagnostic,
  oxlintStderrResult,
  observingToolRun,
  recordFallowPhase,
  selfLoopCombinedFailureResult,
  stubVerifyTools,
  type FallowRules,
} from './verify-phases-helpers.js';
import { intrinsicUiOverlayMatcher } from '#system/tests/support/config-fixtures.ts';
import { expectVerifyFailureText } from '#system/tests/support/verify-assertions.ts';
import { verifyPresentedText } from '#system/tests/support/verify-result-text.ts';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject, runVerifyWithLauncher } = useExecuteVerifyProjects();

describe('verify phases', () => {
  it('keeps both fixers off unless explicitly enabled', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const calls: string[][] = [];
    await executeVerify(
      { projectRoot: cwd, entries: EXECUTE_VERIFY_FIXTURE_ENTRIES, skipPresetProjectChecks: true },
      async (options) => {
        calls.push([...options.args]);
        return emptyToolResult(options.args, options.name);
      },
    );
    expect(calls.some((args) => args.includes('--fix') || args.includes('fix'))).toBe(false);
  });

  it('runs enabled fixers sequentially before read-only analysis', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const calls: string[] = [];
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
        autoFix: { oxlint: true, fallow: true },
      },
      async (options) => {
        calls.push(
          options.name === 'oxlint'
            ? options.args.includes('--fix')
              ? 'oxlint-fix'
              : 'oxlint-check'
            : options.args.includes('fix')
              ? 'fallow-fix'
              : 'fallow-check',
        );
        return emptyToolResult(options.args, options.name);
      },
    );
    expect(result.exitCode).toBe(0);
    expect(calls.slice(0, 3)).toEqual(['oxlint-fix', 'fallow-fix', 'fallow-check']);
    expect(calls).toContain('oxlint-check');
  });

  it('applies opt-in Oxlint fixes to source files', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const path = `${cwd}/src/index.ts`;
    await writeTextFile(path, 'export var value = 1;\n');
    const result = await executeVerify({
      projectRoot: cwd,
      entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
      autoFix: { oxlint: true },
    });
    expect(verifyPresentedText(result)).toContain('verify: ok');
    expect(await readTextFile(path)).toContain('export const value = 1;');
  });

  it('applies opt-in Fallow fixes with the real binary', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const helper = `${cwd}/src/helper.ts`;
    await writeTextFile(helper, 'export const used = 1;\nexport const unused = 2;\n');
    await writeTextFile(
      `${cwd}/src/index.ts`,
      "import { used } from './helper.js';\nexport function getValue() { return used; }\n",
    );
    const result = await executeVerify({
      projectRoot: cwd,
      entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
      autoFix: { fallow: true },
    });
    expect(result.exitCode).toBe(1);
    expect(await readTextFile(helper)).not.toContain('export const unused');
  });

  it('stops verification when Fallow fix fails', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const calls: string[] = [];
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
        autoFix: { fallow: true },
      },
      async (options) => {
        calls.push(options.name);
        return options.args.includes('fix')
          ? { exitCode: 2, stdout: '', stderr: 'cannot fix' }
          : emptyToolResult(options.args, options.name);
      },
    );
    expect(result.exitCode).toBe(2);
    expect(verifyPresentedText(result)).toContain('cannot fix');
    expect(calls).toEqual(['fallow']);
  });
  it('writes runtime UI interaction overlays to the generated Fallow config', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let generated: unknown;
    await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
        intrinsicInteractions: [
          {
            elements: ['canvas'],
            property: 'onDraw',
            classification: 'interaction',
            kind: 'pointer',
          },
        ],
        lifecycleCallbacks: ['onReady'],
        actionCompatibility: { pointer: ['dragTo', 'draw'] },
      },
      async (options) => {
        if (options.name === 'fallow' && generated === undefined) {
          const configPath = configArgOf(options);
          if (configPath !== undefined) generated = await readJsonFile(configPath, v.unknown());
        }
        return emptyToolResult(options.args, options.name);
      },
    );

    expect(generated).toMatchObject(intrinsicUiOverlayMatcher);
  });

  it('does not start oxlint when the cycles gate fails', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const names: string[] = [];
    const result = await runVerifyWithLauncher(cwd, async (options) => {
      await Promise.resolve();
      names.push(options.name);
      if (options.name === 'fallow') {
        return selfLoopCombinedFailureResult();
      }
      return emptyToolResult(options.args, options.name);
    });
    const ephemeral = ephemeralConfigDirs(cwd);
    expectVerifyFailureText(result, 're-export-cycle');
    expect(names.includes('oxlint')).toBe(false);
    expect(names.filter((name) => name === 'fallow')).toHaveLength(1);
    expectEphemeralCleanedUp(ephemeral);
  });

  it('shows a fallow boundary failure before a deferred semantic-lint failure', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const phases: string[] = [];
    const result = await runVerifyWithLauncher(cwd, async (options) => {
      await Promise.resolve();
      recordFallowPhase(phases, options);
      if (options.name === 'oxlint') {
        phases.push('oxlint');
        return oxlintFailureResult(oxlintClassFoundDiagnostic());
      }
      if (options.name === 'fallow' && fallowPhase(options.args) === 'combined') {
        return fallowCombinedFailureResult({
          check: {
            total_issues: 1,
            boundary_violations: [
              { from_path: 'src/index.ts', to_path: 'src/other.ts', line: 1, col: 0 },
            ],
          },
        });
      }
      return emptyToolResult(options.args, 'fallow');
    });
    expectVerifyFailureText(result, 'boundary-violation');
    expect(verifyPresentedText(result)).not.toContain('no-class');
    expect(new Set(phases)).toEqual(new Set(['oxlint', 'combined']));
    expect(phases).toHaveLength(2);
  });

  it('runs all verify phases on the success path', async () => {
    expect(oxlintTypeAwareEnabled(readOxlintConfig(packagedAssetsDirectory()))).toBe(true);
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const phases: string[] = [];
    const oxlintCalls: Array<{ config: string; timeoutMs: number | undefined }> = [];
    const result = await runVerifyWithLauncher(
      cwd,
      stubVerifyTools({
        fallow: observingToolRun((options) => {
          phases.push(`fallow:${fallowPhase(options.args)}`);
        }),
        oxlint: observingToolRun((options) => {
          phases.push('oxlint');
          oxlintCalls.push({
            config: configArgOf(options) ?? '',
            timeoutMs: options.timeoutMs,
          });
        }),
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(new Set(phases)).toEqual(new Set(['oxlint', 'fallow:combined', 'fallow:dupes']));
    expect(phases).toHaveLength(3);
    expect(oxlintCalls).toHaveLength(1);
    expect(oxlintCalls[0]?.config.endsWith('.syntax.config.ts')).toBe(false);
    expect(oxlintCalls[0]?.timeoutMs).toBe(TYPE_AWARE_OXLINT_TIMEOUT_MS);
    const ephemeral = ephemeralConfigDirs(cwd);
    expectEphemeralCleanedUp(ephemeral);
  });

  it('writes one shared fallow config with all rules for every phase', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const configPathsByPhase: Record<string, string> = {};
    const rulesByPhase: Record<string, FallowRules> = {};
    const result = await runVerifyWithLauncher(
      cwd,
      stubVerifyTools({
        fallow: observingToolRun(async (options) => {
          const phase = fallowPhase(options.args);
          configPathsByPhase[phase] = configArgOf(options) ?? '';
          rulesByPhase[phase] = await fallowConfigRules(options.args);
        }),
      }),
    );

    expect(result.exitCode).toBe(0);

    // First launch on the `combined` cache, second launch on the `dupes` cache.
    expect(configPathsByPhase['combined']?.endsWith('.aqg/cache/fallow/verify.json')).toBe(true);
    expect(configPathsByPhase['dupes']?.endsWith('.aqg/cache/fallow/verify-dupes.json')).toBe(true);

    for (const phase of ['combined', 'dupes'] as const) {
      const rules = rulesByPhase[phase];
      expect(rules).toBeDefined();
      if (rules === undefined) {
        continue;
      }
      expect(rules['re-export-cycle']).not.toBe('off');
      expect(rules['boundary-violation']).not.toBe('off');
      expect(rules['unused-exports']).not.toBe('off');
      expect(rules['stale-suppressions']).not.toBe('off');
    }
  });

  it('carries entry and ignore patterns into the shared fallow config', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let parsedDuringRun: { entry?: unknown; ignorePatterns?: unknown } | undefined;
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        ignorePatterns: ['migrations/**'],
        skipPresetProjectChecks: true,
      },
      stubVerifyTools({
        fallow: observingToolRun(async (options) => {
          if (fallowPhase(options.args) === 'combined') {
            const configPath = configArgOf(options) ?? '';
            const loaded = await readJsonFile(configPath, v.looseObject({}));
            parsedDuringRun = loaded;
          }
        }),
      }),
    );
    expect(result.exitCode).toBe(0);
    expect(parsedDuringRun?.entry).toEqual([...EXECUTE_VERIFY_FIXTURE_ENTRIES]);
    const ignorePatterns = v.safeParse(v.array(v.unknown()), parsedDuringRun?.['ignorePatterns']);
    expect(ignorePatterns.success && ignorePatterns.output.includes('migrations/**')).toBe(true);
  });

  it('hides later-group oxlint findings behind a deferred counter', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    const result = await executeVerifyDatabasePreset(cwd, async (options) => {
      await Promise.resolve();
      if (options.name === 'oxlint') {
        return oxlintFailureResult(
          oxlintJsonDiagnostic({
            message: 'bad DAO usage',
            code: 'database(dao-boundaries)',
            filename: 'src/index.ts',
            line: 1,
          }),
          oxlintClassFoundDiagnostic(2),
          oxlintClassFoundDiagnostic(3),
        );
      }
      return emptyToolResult(options.args, options.name);
    });
    expectVerifyFailureText(result, 'dao-boundaries');
    expect(verifyPresentedText(result)).not.toContain('no-class');
    expect(result.deferredCount).toBe(2);
  });

  it('shows unfiltered output when oxlint crashes without issue lines', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const result = await runVerifyWithLauncher(cwd, async (options) => {
      await Promise.resolve();
      if (options.name === 'oxlint') {
        return oxlintStderrResult(70, 'internal oxlint panic\n');
      }
      return emptyToolResult(options.args, options.name);
    });
    expect(result.exitCode).toBe(70);
    expect(result.failures?.[0]?.message ?? result.opaqueText ?? '').toContain(
      'internal oxlint panic',
    );
    expect(result.deferredCount ?? 0).toBe(0);
  });
});
