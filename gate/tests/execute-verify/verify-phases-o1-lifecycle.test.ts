import { describe, expect, it } from 'bun:test';

import { executeVerify, type VerifyResult } from '../../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';
import { emptyToolResult, fallowPhase } from './verify-phases-helpers.js';
import { verifyPresentedText } from '../../../tests/support/verify-result-text.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject } = useExecuteVerifyProjects();

describe('verify phases O1 lifecycle', () => {
  it('does not start late stages when preset preflight fails', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const names: string[] = [];
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        presets: ['config'],
        skipPresetProjectChecks: false,
      },
      async (options) => {
        await Promise.resolve();
        names.push(options.name);
        return emptyToolResult(options.args, options.name);
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(
      result.opaqueText ?? result.failures?.[0]?.message ?? result.statusStderr ?? '',
    ).toContain('preset dependency check failed');
    expect(names).toEqual([]);
  });

  it('starts hygiene and complexity while oxlint is still held', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let releaseOxlint!: () => void;
    const oxlintGate = new Promise<void>((resolve) => {
      releaseOxlint = resolve;
    });
    let markHygieneStarted!: () => void;
    const hygieneStarted = new Promise<void>((resolve) => {
      markHygieneStarted = resolve;
    });
    let markComplexityStarted!: () => void;
    const complexityStarted = new Promise<void>((resolve) => {
      markComplexityStarted = resolve;
    });
    const startCounts = {
      oxlint: 0,
      boundaries: 0,
      hygiene: 0,
      complexity: 0,
    };

    const verifyPromise = executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        if (options.name === 'oxlint') {
          startCounts.oxlint += 1;
          await oxlintGate;
          return emptyToolResult(options.args, options.name);
        }
        if (options.name === 'fallow') {
          const phase = fallowPhase(options.args);
          if (phase === 'cycles') {
            return emptyToolResult(options.args, options.name);
          }
          if (phase === 'boundaries') {
            startCounts.boundaries += 1;
            return emptyToolResult(options.args, options.name);
          }
          if (phase === 'hygiene') {
            startCounts.hygiene += 1;
            markHygieneStarted();
            return emptyToolResult(options.args, options.name);
          }
          if (phase === 'complexity') {
            startCounts.complexity += 1;
            markComplexityStarted();
            return emptyToolResult(options.args, options.name);
          }
        }
        return {
          exitCode: 0,
          stdout: options.args.includes('json') ? '{"kind":"dead-code","total_issues":0}' : '',
          stderr: '',
        };
      },
    );

    await Promise.all([hygieneStarted, complexityStarted]);
    expect(startCounts.oxlint).toBe(1);
    expect(startCounts.hygiene).toBe(1);
    expect(startCounts.complexity).toBe(1);
    releaseOxlint();
    const result = await verifyPromise;
    expect(result.exitCode).toBe(0);
    expect(startCounts).toEqual({
      oxlint: 1,
      boundaries: 1,
      hygiene: 1,
      complexity: 1,
    });
  });

  it('preserves diagnostic priority across completion orders', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');

    async function runWithOrder(order: readonly string[]): Promise<VerifyResult> {
      const releases: Array<() => void> = [];
      const waits: Array<Promise<void>> = [];
      let previous: Promise<void> = Promise.resolve();
      for (const _phase of order) {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        waits.push(previous);
        releases.push(release);
        previous = gate;
      }

      return await executeVerify(
        {
          projectRoot: cwd,
          entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
          skipPresetProjectChecks: true,
        },
        async (options) => {
          const phase = options.name === 'oxlint' ? 'oxlint' : fallowPhase(options.args);
          const index = order.indexOf(phase);
          if (index >= 0) {
            await waits[index];
            releases[index]?.();
          }
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
            return {
              exitCode: 0,
              stdout: JSON.stringify({
                kind: 'combined',
                check: {
                  total_issues: 1,
                  unused_exports: [{ path: 'src/dead.ts', export_name: 'dead', line: 1, col: 0 }],
                },
                dupes: { clone_groups: [] },
              }),
              stderr: '',
            };
          }
          if (options.name === 'fallow' && fallowPhase(options.args) === 'complexity') {
            return {
              exitCode: 1,
              stdout: JSON.stringify({
                kind: 'health',
                findings: [{ path: 'src/index.ts', name: 'tooComplex', line: 1, cyclomatic: 99 }],
              }),
              stderr: '',
            };
          }
          return emptyToolResult(options.args, options.name);
        },
      );
    }

    for (const order of [
      ['oxlint', 'boundaries', 'hygiene', 'complexity'],
      ['complexity', 'hygiene', 'boundaries', 'oxlint'],
      ['hygiene', 'oxlint', 'complexity', 'boundaries'],
    ] as const) {
      const result = await runWithOrder(order);
      expect(result.exitCode).toBe(1);
      expect(verifyPresentedText(result)).toContain('no-debugger');
      expect(verifyPresentedText(result)).not.toContain('unused-exports');
      expect(verifyPresentedText(result)).not.toContain('complexity:');
    }
  });

  it('handles early and late rejected promises without unhandled rejection', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');

    let releaseOxlint!: () => void;
    const oxlintGate = new Promise<void>((resolve) => {
      releaseOxlint = resolve;
    });
    let markHygieneRejected!: () => void;
    const hygieneRejected = new Promise<void>((resolve) => {
      markHygieneRejected = resolve;
    });

    const earlyVerify = executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        if (options.name === 'oxlint') {
          await oxlintGate;
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
          markHygieneRejected();
          throw new Error('hygiene exploded early');
        }
        return emptyToolResult(options.args, options.name);
      },
    );
    await hygieneRejected;
    releaseOxlint();
    const earlyResult = await earlyVerify;
    expect(earlyResult.exitCode).toBe(1);
    expect(JSON.stringify(earlyResult.diagnostics)).toContain('no-debugger');

    let lateMessage = '';
    try {
      await executeVerify(
        {
          projectRoot: cwd,
          entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
          skipPresetProjectChecks: true,
        },
        async (options) => {
          await Promise.resolve();
          if (options.name === 'fallow' && fallowPhase(options.args) === 'hygiene') {
            throw new Error('hygiene exploded late');
          }
          return emptyToolResult(options.args, options.name);
        },
      );
    } catch (error) {
      lateMessage = error instanceof Error ? error.message : String(error);
    }
    expect(lateMessage).toBe('hygiene exploded late');
  });
});
