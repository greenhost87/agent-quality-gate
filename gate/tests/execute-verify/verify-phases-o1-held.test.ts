import { existsSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import { VERIFY_TIMING_ENV } from '../../execute-verify/verify-timing.js';
import { setEnv } from '../../read-env/read-env.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';
import { verifyPresentedText } from '../../../tests/support/verify-result-text.js';
import { emptyToolResult, ephemeralConfigDirs, fallowPhase } from './verify-phases-helpers.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject } = useExecuteVerifyProjects();

describe('verify phases O1 held stages', () => {
  it('does not return or clean configs while held stages still need them', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const ephemeral = ephemeralConfigDirs(cwd);
    let releaseHygiene!: () => void;
    const hygieneGate = new Promise<void>((resolve) => {
      releaseHygiene = resolve;
    });
    let markHygieneWaiting!: () => void;
    const hygieneWaiting = new Promise<void>((resolve) => {
      markHygieneWaiting = resolve;
    });
    let configPresentWhileWaiting = false;

    const verifyPromise = executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        if (options.name === 'oxlint') {
          return {
            exitCode: 1,
            stdout: JSON.stringify({
              diagnostics: [
                {
                  message: 'debugger',
                  code: 'eslint(no-debugger)',
                  severity: 'error',
                  filename: 'src/index.ts',
                  labels: [{ span: { line: 1, column: 1 } }],
                },
              ],
            }),
            stderr: '',
          };
        }
        if (options.name === 'fallow' && fallowPhase(options.args) === 'hygiene') {
          const configPath = options.args[options.args.indexOf('--config') + 1] ?? '';
          configPresentWhileWaiting = existsSync(configPath);
          markHygieneWaiting();
          await hygieneGate;
          configPresentWhileWaiting = configPresentWhileWaiting && existsSync(configPath);
          return emptyToolResult(options.args, options.name);
        }
        return emptyToolResult(options.args, options.name);
      },
    );

    await hygieneWaiting;
    let settledEarly = false;
    void verifyPromise.then(() => {
      settledEarly = true;
    });
    await Promise.resolve();
    expect(settledEarly).toBe(false);
    expect(configPresentWhileWaiting).toBe(true);
    releaseHygiene();
    const result = await verifyPromise;
    expect(result.exitCode).toBe(1);
    expect(verifyPresentedText(result)).toContain('no-debugger');
    expect(configPresentWhileWaiting).toBe(true);
    expect(existsSync(ephemeral.fallow)).toBe(false);
    expect(existsSync(ephemeral.oxlint)).toBe(false);
  });

  it('does not treat a late rejection as success when early stages pass', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let message = '';
    try {
      await executeVerify(
        {
          projectRoot: cwd,
          entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
          skipPresetProjectChecks: true,
        },
        async (options) => {
          await Promise.resolve();
          if (options.name === 'fallow' && fallowPhase(options.args) === 'complexity') {
            throw new Error('complexity exploded');
          }
          return emptyToolResult(options.args, options.name);
        },
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('complexity exploded');
  });

  it('records timings for stages that actually ran on early oxlint failure', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    setEnv(VERIFY_TIMING_ENV, '1');
    try {
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
              stdout: JSON.stringify({
                diagnostics: [
                  {
                    message: 'debugger',
                    code: 'eslint(no-debugger)',
                    severity: 'error',
                    filename: 'src/index.ts',
                    labels: [{ span: { line: 1, column: 1 } }],
                  },
                ],
              }),
              stderr: '',
            };
          }
          return emptyToolResult(options.args, options.name);
        },
      );
      expect(result.exitCode).toBe(1);
      expect((result.statusStderr ?? '').includes('verify-timing: fallow-cycles=')).toBe(true);
      expect((result.statusStderr ?? '').includes('oxlint=')).toBe(true);
      expect((result.statusStderr ?? '').includes('fallow-boundaries=')).toBe(true);
      expect((result.statusStderr ?? '').includes('fallow-hygiene=')).toBe(true);
      expect((result.statusStderr ?? '').includes('fallow-complexity=')).toBe(true);
      expect((result.statusStderr ?? '').includes('verify-timing: total=')).toBe(true);
    } finally {
      setEnv(VERIFY_TIMING_ENV, undefined);
    }
  });
});
