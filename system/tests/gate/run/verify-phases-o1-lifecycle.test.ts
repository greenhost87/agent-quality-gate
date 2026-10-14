import { describe, expect, it } from 'bun:test';

import { executeVerify, type VerifyResult } from '#system/gate/run/execute-verify.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';
import {
  combinedRunFailure,
  deadExportCombinedFailureResult,
  debuggerDiagnostic,
  emptyToolResult,
  fallowPhase,
  fixtureVerifyRequest,
  oxlintFailureResult,
} from './verify-phases-helpers.js';
import { expectVerifyFailureText } from '#system/tests/support/verify-assertions.ts';
import { verifyPresentedText } from '#system/tests/support/verify-result-text.ts';

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

  it('holds oxlint until the shared combined run resolves green cycles', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let releaseCombined!: () => void;
    const combinedGate = new Promise<void>((resolve) => {
      releaseCombined = resolve;
    });
    let markOxlintStarted!: () => void;
    const oxlintStarted = new Promise<void>((resolve) => {
      markOxlintStarted = resolve;
    });
    const startCounts = {
      oxlint: 0,
      fallow: 0,
    };

    const verifyPromise = executeVerify(fixtureVerifyRequest(cwd), async (options) => {
      if (options.name === 'fallow') {
        startCounts.fallow += 1;
        await combinedGate;
        return emptyToolResult(options.args, options.name);
      }
      if (options.name === 'oxlint') {
        startCounts.oxlint += 1;
        markOxlintStarted();
        return emptyToolResult(options.args, options.name);
      }
      return {
        exitCode: 0,
        stdout: options.args.includes('json') ? '{"kind":"dead-code","total_issues":0}' : '',
        stderr: '',
      };
    });

    // The cycles gate parks on the shared run: oxlint cannot start first.
    // Polling (not sleeping) is deterministic here — once the combined
    // counter is visible the pipeline is parked on the gate behind it.
    const deadline = Date.now() + 5000;
    while (startCounts.fallow === 0) {
      if (Date.now() > deadline) {
        throw new Error('timed out waiting for the combined run to start');
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    }
    expect(startCounts.fallow).toBe(1);
    expect(startCounts.oxlint).toBe(0);
    releaseCombined();
    await oxlintStarted;
    const result = await verifyPromise;
    expect(result.exitCode).toBe(0);
    // First launch gates oxlint; the dupes launch follows on the green path.
    expect(startCounts).toEqual({
      oxlint: 1,
      fallow: 2,
    });
  });

  it('prefers the oxlint failure however slow oxlint completes', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');

    // The shared combined run always resolves before oxlint starts, so the
    // remaining order variance is oxlint latency: pin the selector priority
    // for an immediate and a delayed oxlint failure alike.
    async function runWithOxlintDelay(delayOxlint: boolean): Promise<VerifyResult> {
      let releaseOxlint!: () => void;
      const oxlintGate = new Promise<void>((resolve) => {
        releaseOxlint = resolve;
      });
      if (delayOxlint) {
        setTimeout(releaseOxlint, 25);
      } else {
        releaseOxlint();
      }

      return await executeVerify(fixtureVerifyRequest(cwd), async (options) => {
        if (options.name === 'oxlint') {
          await oxlintGate;
          return oxlintFailureResult(debuggerDiagnostic());
        }
        if (options.name === 'fallow' && fallowPhase(options.args) === 'combined') {
          return deadExportCombinedFailureResult();
        }
        return emptyToolResult(options.args, options.name);
      });
    }

    for (const delayOxlint of [false, true]) {
      const result = await runWithOxlintDelay(delayOxlint);
      expectVerifyFailureText(result, 'no-debugger');
      expect(verifyPresentedText(result)).not.toContain('unused-exports');
      expect(verifyPresentedText(result)).not.toContain('complexity:');
    }
  });

  it('handles early and late rejected promises without unhandled rejection', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');

    let markCombinedRejected!: () => void;
    const combinedRejected = new Promise<void>((resolve) => {
      markCombinedRejected = resolve;
    });

    // A throwing shared run rejects the whole verify at the cycles gate:
    // later stages never start, so there is nothing to settle or mask.
    const started: string[] = [];
    const earlyVerify = executeVerify(fixtureVerifyRequest(cwd), async (options) => {
      await Promise.resolve();
      started.push(options.name);
      if (options.name === 'fallow' && fallowPhase(options.args) === 'combined') {
        markCombinedRejected();
        throw new Error('combined exploded early');
      }
      return emptyToolResult(options.args, options.name);
    });
    await combinedRejected;
    let earlyMessage = '';
    try {
      await earlyVerify;
    } catch (error) {
      earlyMessage = error instanceof Error ? error.message : String(error);
    }
    expect(earlyMessage).toBe('combined exploded early');
    expect(started).toEqual(['fallow']);

    const lateMessage = await combinedRunFailure(cwd, 'combined exploded late');
    expect(lateMessage).toBe('combined exploded late');
  });
});
