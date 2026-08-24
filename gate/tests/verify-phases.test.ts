import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { readJsonFile } from '../../process/files/files.js';
import { readOxlintConfig } from '../../config/verify-config-files/verify-config-files.js';
import { executeVerify, TYPE_AWARE_OXLINT_TIMEOUT_MS } from '../execute-verify/execute-verify.js';
import { VERIFY_TIMING_ENV } from '../execute-verify/verify-timing.js';
import { oxlintTypeAwareEnabled } from '../../preset-catalog/oxlint-config/write-oxlint-config.js';
import { setEnv } from '../read-env/read-env.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  EXECUTE_VERIFY_REPO_ROOT,
  useExecuteVerifyProjects,
} from '../../tests/support/execute-verify-fixture.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject, runVerify } = useExecuteVerifyProjects();

function fallowPhase(args: readonly string[]): string {
  if (args.includes('--re-export-cycles') || args.includes('--circular-deps')) {
    return 'cycles';
  }
  if (args.includes('--complexity')) {
    return 'complexity';
  }
  const skipIndex = args.indexOf('--skip');
  if (skipIndex >= 0 && args[skipIndex + 1] === 'health') {
    return 'skip-health';
  }
  return 'unknown';
}

function toolOutput(result: { stdout: string; stderr: string }): string {
  return result.stdout + '\n' + result.stderr;
}

function ephemeralConfigDirs(projectRoot: string): { fallow: string; oxlint: string } {
  return {
    fallow: join(projectRoot, '.aqg', 'fallow'),
    oxlint: join(projectRoot, '.aqg', 'oxlint'),
  };
}

function fallowConfigSnapshot(value: object): { entry?: string[]; ignorePatterns?: string[] } {
  const candidate = value as { entry?: unknown; ignorePatterns?: unknown };
  return {
    ...(Array.isArray(candidate.entry) ? { entry: candidate.entry.map(String) } : {}),
    ...(Array.isArray(candidate.ignorePatterns)
      ? { ignorePatterns: candidate.ignorePatterns.map(String) }
      : {}),
  };
}

describe('verify phases', () => {
  it('does not start oxlint when the cycle preflight fails', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const names: string[] = [];
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        names.push(options.name);
        if (options.name === 'fallow' && fallowPhase(options.args) === 'cycles') {
          return {
            exitCode: 1,
            stdout: 're-export-cycle:src/index.ts\n',
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stdout.includes('re-export-cycle:src/index.ts')).toBe(true);
    expect(names.includes('oxlint')).toBe(false);
    expect(names.filter((name) => name === 'fallow')).toHaveLength(1);
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('runs skip-health fallow, complexity, and timed oxlint after cycle preflight', async () => {
    expect(oxlintTypeAwareEnabled(readOxlintConfig(join(EXECUTE_VERIFY_REPO_ROOT, 'assets')))).toBe(
      true,
    );
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const fallowPhases: string[] = [];
    const oxlintCalls: Array<{ config: string; timeoutMs: number | undefined }> = [];
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'fallow') {
          fallowPhases.push(fallowPhase(options.args));
        }
        if (options.name === 'oxlint') {
          const configIndex = options.args.indexOf('--config');
          oxlintCalls.push({
            config: options.args[configIndex + 1] ?? '',
            timeoutMs: options.timeoutMs,
          });
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    expect(result.exitCode).toBe(0);
    expect(fallowPhases[0]).toBe('cycles');
    expect(new Set(fallowPhases.slice(1))).toEqual(new Set(['skip-health', 'complexity']));
    expect(oxlintCalls).toHaveLength(1);
    expect(oxlintCalls[0]?.config.endsWith('.syntax.config.ts')).toBe(false);
    expect(oxlintCalls[0]?.timeoutMs).toBe(TYPE_AWARE_OXLINT_TIMEOUT_MS);
    const ephemeral = ephemeralConfigDirs(cwd);
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('writes Fallow config for tools and removes ephemeral configs afterward', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let parsedDuringRun: { entry?: string[]; ignorePatterns?: string[] } | undefined;
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        ignorePatterns: ['migrations/**'],
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'fallow' && fallowPhase(options.args) === 'cycles') {
          const configIndex = options.args.indexOf('--config');
          const configPath = options.args[configIndex + 1] ?? '';
          const loaded = await readJsonFile(configPath);
          if (loaded !== null && typeof loaded === 'object') {
            parsedDuringRun = fallowConfigSnapshot(loaded);
          }
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expect(result.exitCode).toBe(0);
    expect(parsedDuringRun?.entry).toEqual([...EXECUTE_VERIFY_FIXTURE_ENTRIES]);
    expect(parsedDuringRun?.ignorePatterns ?? []).toContain('migrations/**');
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('removes ephemeral configs after oxlint failure', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'oxlint') {
          return {
            exitCode: 1,
            stdout: 'eslint(no-debugger):src/index.ts:1:1\n',
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.includes('eslint(no-debugger)')).toBe(true);
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('removes ephemeral configs after oxlint timeout', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'oxlint') {
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'hint:type-aware-timeout\n',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.includes('hint:type-aware-timeout')).toBe(true);
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('removes ephemeral configs when a parallel tool runner throws', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let thrownMessage = '';
    try {
      await executeVerify(
        {
          projectRoot: cwd,
          entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
          skipPresetProjectChecks: true,
        },
        async (options) => {
          await Promise.resolve();
          if (options.name === 'oxlint') {
            throw new Error('oxlint exploded');
          }
          return { exitCode: 0, stdout: '', stderr: '' };
        },
      );
    } catch (error) {
      thrownMessage = error instanceof Error ? error.message : String(error);
    }
    expect(thrownMessage).toBe('oxlint exploded');
    const ephemeral = ephemeralConfigDirs(cwd);
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('writes phase timings to stderr when VERIFY_TIMING is set', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    setEnv(VERIFY_TIMING_ENV, '1');
    try {
      const result = await executeVerify(
        {
          projectRoot: cwd,
          entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
          skipPresetProjectChecks: true,
        },
        async () => {
          await Promise.resolve();
          return { exitCode: 0, stdout: '', stderr: '' };
        },
      );
      expect(result.stderr.includes('verify-timing: fallow-cycles=')).toBe(true);
      expect(result.stderr.includes('fallow-skip-health=')).toBe(true);
      expect(result.stderr.includes('fallow-complexity=')).toBe(true);
      expect(result.stderr.includes('oxlint=')).toBe(true);
      expect(result.stderr.includes('verify-timing: total=')).toBe(true);
    } finally {
      setEnv(VERIFY_TIMING_ENV, undefined);
    }
  });

  it('fails a self-reexport cycle without type-aware diagnostics', async () => {
    const cwd = await createTypeScriptProject('circular-self-reexport/src/index.ts');
    const started = performance.now();
    const result = await runVerify(cwd);
    const output = toolOutput(result);
    expect(performance.now() - started).toBeLessThan(15_000);
    expect(result.exitCode).toBe(1);
    expect(output.includes('typescript(no-unsafe-') || output.includes('typescript(TS')).toBe(
      false,
    );
    expect(output.includes('re-export-cycle') || output.includes('circular')).toBe(true);
  });

  it('fails high cyclomatic complexity without git health noise', async () => {
    const cwd = await createTypeScriptProject('high-complexity/src/index.ts');
    const result = await runVerify(cwd);
    const output = toolOutput(result);
    expect(result.exitCode).toBe(1);
    expect(output.toLowerCase().includes('complexity')).toBe(true);
    expect(output.includes('hotspot:')).toBe(false);
    expect(output.includes('vital-signs:')).toBe(false);
  });
});
