import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';

import { readJsonFile } from '../../../process/files/files.js';
import { readOxlintConfig } from '../../../config/verify-config-files/verify-config-files.js';
import { executeVerify } from '../../execute-verify/execute-verify.js';
import { TYPE_AWARE_OXLINT_TIMEOUT_MS } from '../../execute-verify/run-execute-verify-body.js';
import { VERIFY_TIMING_ENV } from '../../execute-verify/verify-timing.js';
import { oxlintTypeAwareEnabled } from '../../../preset-catalog/oxlint-config/write-oxlint-config.js';
import { setEnv } from '../../read-env/read-env.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  EXECUTE_VERIFY_REPO_ROOT,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject, runVerify } = useExecuteVerifyProjects();

function fallowPhase(args: readonly string[]): string {
  if (args.includes('--boundary-violations')) {
    return 'boundaries';
  }
  if (args.includes('--re-export-cycles') || args.includes('--unresolved-imports')) {
    return 'cycles';
  }
  if (args.includes('--complexity')) {
    return 'complexity';
  }
  const skipIndex = args.indexOf('--skip');
  if (skipIndex >= 0 && args[skipIndex + 1] === 'health') {
    return 'hygiene';
  }
  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function fallowConfigRules(args: readonly string[]): Promise<Record<string, unknown>> {
  const configIndex = args.indexOf('--config');
  const configPath = args[configIndex + 1] ?? '';
  const loaded = await readJsonFile(configPath, v.looseObject({}));
  const rules = isRecord(loaded['rules']) ? loaded['rules'] : undefined;
  if (rules === undefined) {
    throw new Error(`fallow config ${configPath} has no rules object`);
  }
  return rules;
}

function toolOutput(result: { stdout: string; stderr: string }): string {
  return result.stdout + '\n' + result.stderr;
}

const FIXTURES = join(import.meta.dir, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function ephemeralConfigDirs(projectRoot: string): { fallow: string; oxlint: string } {
  return {
    fallow: join(projectRoot, '.aqg', 'fallow'),
    oxlint: join(projectRoot, '.aqg', 'oxlint'),
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

  it('shows a fallow boundary failure before a deferred semantic-lint failure', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const phases: string[] = [];
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'fallow') {
          phases.push(fallowPhase(options.args));
        }
        if (options.name === 'oxlint') {
          phases.push('oxlint');
          return {
            exitCode: 1,
            stdout: 'src/index.ts:1:1: error aqg(no-class): class found\n',
            stderr: '',
          };
        }
        if (options.name === 'fallow' && fallowPhase(options.args) === 'boundaries') {
          return {
            exitCode: 1,
            stdout: 'boundary-violation:src/index.ts\n',
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('boundary-violation');
    expect(result.stdout).not.toContain('no-class');
    expect(phases).toEqual(['cycles', 'oxlint', 'boundaries']);
  });

  it('runs all verify phases on the success path', async () => {
    expect(oxlintTypeAwareEnabled(readOxlintConfig(join(EXECUTE_VERIFY_REPO_ROOT, 'assets')))).toBe(
      true,
    );
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const phases: string[] = [];
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
          phases.push(`fallow:${fallowPhase(options.args)}`);
        }
        if (options.name === 'oxlint') {
          phases.push('oxlint');
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
    expect(phases).toEqual([
      'fallow:cycles',
      'oxlint',
      'fallow:boundaries',
      'fallow:hygiene',
      'fallow:complexity',
    ]);
    expect(oxlintCalls).toHaveLength(1);
    expect(oxlintCalls[0]?.config.endsWith('.syntax.config.ts')).toBe(false);
    expect(oxlintCalls[0]?.timeoutMs).toBe(TYPE_AWARE_OXLINT_TIMEOUT_MS);
    const ephemeral = ephemeralConfigDirs(cwd);
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('writes one shared fallow config with all rules for every phase', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const configPathsByPhase: Record<string, string> = {};
    const rulesByPhase: Record<string, Record<string, unknown>> = {};
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'fallow') {
          const phase = fallowPhase(options.args);
          const configIndex = options.args.indexOf('--config');
          configPathsByPhase[phase] = options.args[configIndex + 1] ?? '';
          rulesByPhase[phase] = await fallowConfigRules(options.args);
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );

    expect(result.exitCode).toBe(0);

    const phases = ['cycles', 'boundaries', 'hygiene', 'complexity'] as const;
    const configPaths = phases.map((phase) => configPathsByPhase[phase]);
    expect(new Set(configPaths).size).toBe(1);
    expect(configPaths[0]?.endsWith('.aqg/fallow/verify.json')).toBe(true);

    for (const phase of phases) {
      const rules = rulesByPhase[phase] ?? {};
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
      async (options) => {
        await Promise.resolve();
        if (options.name === 'fallow' && fallowPhase(options.args) === 'complexity') {
          const configPath = options.args[options.args.indexOf('--config') + 1] ?? '';
          const loaded = await readJsonFile(configPath, v.looseObject({}));
          parsedDuringRun = loaded;
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    expect(result.exitCode).toBe(0);
    expect(parsedDuringRun?.entry).toEqual([...EXECUTE_VERIFY_FIXTURE_ENTRIES]);
    const ignorePatterns = parsedDuringRun?.['ignorePatterns'];
    expect(Array.isArray(ignorePatterns) && ignorePatterns.includes('migrations/**')).toBe(true);
  });

  it('hides later-group oxlint findings behind a deferred counter', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        presets: ['database'],
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'oxlint') {
          return {
            exitCode: 1,
            stdout: fixture('select-first-group-deferred.txt'),
            stderr: '',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('dao-boundaries');
    expect(result.stdout).not.toContain('no-class');
    expect(result.stderr).toContain('verify: deferred: 2');
  });

  it('shows unfiltered output when oxlint crashes without issue lines', async () => {
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
            exitCode: 70,
            stdout: '',
            stderr: 'internal oxlint panic\n',
          };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    expect(result.exitCode).toBe(70);
    expect(result.stderr).toContain('internal oxlint panic');
    expect(result.stderr).not.toContain('deferred');
  });

  it('reports a hygiene failure before a complexity failure when both phases run', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const phases: string[] = [];
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'fallow') {
          phases.push(fallowPhase(options.args));
        }
        if (options.name === 'fallow' && fallowPhase(options.args) === 'hygiene') {
          return { exitCode: 1, stdout: 'unused-exports:src/dead.ts\n', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('unused-exports');
    expect(phases).toEqual(['cycles', 'boundaries', 'hygiene', 'complexity']);
  });

  it('writes phase timings under the new phase names when VERIFY_TIMING is set', async () => {
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
      expect(result.stderr.includes('fallow-boundaries=')).toBe(true);
      expect(result.stderr.includes('oxlint=')).toBe(true);
      expect(result.stderr.includes('fallow-hygiene=')).toBe(true);
      expect(result.stderr.includes('fallow-complexity=')).toBe(true);
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
