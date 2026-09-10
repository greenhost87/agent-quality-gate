import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import * as v from 'valibot';

import { readOxlintConfig } from '../../../config/verify-config-files/verify-config-files.js';
import { readJsonFile } from '../../../process/files/files.js';
import { executeVerify } from '../../execute-verify/execute-verify.js';
import { TYPE_AWARE_OXLINT_TIMEOUT_MS } from '../../../config/tuning/tuning.js';
import { oxlintTypeAwareEnabled } from '../../../preset-catalog/oxlint-config/write-oxlint-config.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  EXECUTE_VERIFY_REPO_ROOT,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';
import {
  emptyFallowJson,
  emptyToolResult,
  ephemeralConfigDirs,
  fallowConfigRules,
  fallowPhase,
  oxlintJsonDiagnostic,
  oxlintJsonStdout,
  type FallowRules,
} from './verify-phases-helpers.js';
import { verifyPresentedText } from '../../../tests/support/verify-result-text.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject } = useExecuteVerifyProjects();

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
            stdout: JSON.stringify({
              kind: 'dead-code',
              re_export_cycles: [{ files: ['src/index.ts'], kind: 'self-loop' }],
            }),
            stderr: '',
          };
        }
        return emptyToolResult(options.args, options.name);
      },
    );
    const ephemeral = ephemeralConfigDirs(cwd);
    expect(result.exitCode).toBe(1);
    expect(verifyPresentedText(result)).toContain('re-export-cycle');
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
            stdout: oxlintJsonStdout(
              oxlintJsonDiagnostic({
                message: 'class found',
                code: 'aqg(no-class)',
                filename: 'src/index.ts',
              }),
            ),
            stderr: '',
          };
        }
        if (options.name === 'fallow' && fallowPhase(options.args) === 'boundaries') {
          return {
            exitCode: 1,
            stdout: JSON.stringify({
              kind: 'dead-code',
              boundary_violations: [
                { from_path: 'src/index.ts', to_path: 'src/other.ts', line: 1, col: 0 },
              ],
            }),
            stderr: '',
          };
        }
        return {
          exitCode: 0,
          stdout: emptyFallowJson(options.args),
          stderr: '',
        };
      },
    );
    expect(result.exitCode).toBe(1);
    expect(verifyPresentedText(result)).toContain('boundary-violation');
    expect(verifyPresentedText(result)).not.toContain('no-class');
    expect(phases[0]).toBe('cycles');
    expect(new Set(phases.slice(1))).toEqual(
      new Set(['oxlint', 'boundaries', 'hygiene', 'complexity', 'structural']),
    );
    expect(phases).toHaveLength(6);
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
        return {
          exitCode: 0,
          stdout: options.name === 'fallow' ? emptyFallowJson(options.args) : '{"diagnostics":[]}',
          stderr: '',
        };
      },
    );
    expect(result.exitCode).toBe(0);
    expect(phases[0]).toBe('fallow:cycles');
    expect(new Set(phases.slice(1))).toEqual(
      new Set([
        'oxlint',
        'fallow:boundaries',
        'fallow:hygiene',
        'fallow:complexity',
        'fallow:structural',
      ]),
    );
    expect(phases).toHaveLength(6);
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
    const rulesByPhase: Record<string, FallowRules> = {};
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
        return {
          exitCode: 0,
          stdout: options.name === 'fallow' ? emptyFallowJson(options.args) : '{"diagnostics":[]}',
          stderr: '',
        };
      },
    );

    expect(result.exitCode).toBe(0);

    const phases = ['cycles', 'boundaries', 'hygiene', 'complexity', 'structural'] as const;
    const configPaths = phases
      .map((phase) => configPathsByPhase[phase])
      .filter((path): path is string => path !== undefined && path.length > 0);
    expect(new Set(configPaths).size).toBe(1);
    expect(configPaths.some((path) => path.endsWith('.aqg/cache/fallow/verify.json'))).toBe(true);

    for (const phase of phases) {
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
      async (options) => {
        await Promise.resolve();
        if (options.name === 'fallow' && fallowPhase(options.args) === 'complexity') {
          const configPath = options.args[options.args.indexOf('--config') + 1] ?? '';
          const loaded = await readJsonFile(configPath, v.looseObject({}));
          parsedDuringRun = loaded;
        }
        return {
          exitCode: 0,
          stdout: options.name === 'fallow' ? emptyFallowJson(options.args) : '{"diagnostics":[]}',
          stderr: '',
        };
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
            stdout: oxlintJsonStdout(
              oxlintJsonDiagnostic({
                message: 'bad DAO usage',
                code: 'database(dao-boundaries)',
                filename: 'src/index.ts',
                line: 1,
              }),
              oxlintJsonDiagnostic({
                message: 'class found',
                code: 'aqg(no-class)',
                filename: 'src/index.ts',
                line: 2,
              }),
              oxlintJsonDiagnostic({
                message: 'class found',
                code: 'aqg(no-class)',
                filename: 'src/index.ts',
                line: 3,
              }),
            ),
            stderr: '',
          };
        }
        return emptyToolResult(options.args, options.name);
      },
    );
    expect(result.exitCode).toBe(1);
    expect(verifyPresentedText(result)).toContain('dao-boundaries');
    expect(verifyPresentedText(result)).not.toContain('no-class');
    expect(result.deferredCount).toBe(2);
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
        return emptyToolResult(options.args, options.name);
      },
    );
    expect(result.exitCode).toBe(70);
    expect(result.failures?.[0]?.message ?? result.opaqueText ?? '').toContain(
      'internal oxlint panic',
    );
    expect(result.deferredCount ?? 0).toBe(0);
  });
});
