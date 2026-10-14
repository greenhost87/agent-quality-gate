import { existsSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { executeVerify } from '#system/gate/run/execute-verify.ts';
import { VERIFY_TIMING_ENV } from '#system/gate/run/verify-timing.ts';
import { setEnv } from '#system/gate/read-env/read-env.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  runCleanProjectVerify,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';
import { expectVerifyFailureText } from '#system/tests/support/verify-assertions.ts';
import {
  combinedRunFailure,
  configArgOf,
  debuggerDiagnostic,
  emptyToolResult,
  ephemeralConfigDirs,
  expectEphemeralCleanedUp,
  fallowPhase,
  fixtureVerifyRequest,
  oxlintFailureResult,
  stubVerifyTools,
} from './verify-phases-helpers.js';

useIsolatedAgentQualityGateHome();
const projects = useExecuteVerifyProjects();
const { createTypeScriptProject } = projects;

describe('verify phases O1 held stages', () => {
  it('does not return or clean configs while held stages still need them', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const ephemeral = ephemeralConfigDirs(cwd);
    let releaseCombined!: () => void;
    const combinedGate = new Promise<void>((resolve) => {
      releaseCombined = resolve;
    });
    let markCombinedWaiting!: () => void;
    const combinedWaiting = new Promise<void>((resolve) => {
      markCombinedWaiting = resolve;
    });
    let configPresentWhileWaiting = false;

    const verifyPromise = executeVerify(fixtureVerifyRequest(cwd), async (options) => {
      if (options.name === 'oxlint') {
        return oxlintFailureResult(debuggerDiagnostic());
      }
      if (options.name === 'fallow' && fallowPhase(options.args) === 'combined') {
        const configPath = configArgOf(options) ?? '';
        configPresentWhileWaiting = existsSync(configPath);
        markCombinedWaiting();
        await combinedGate;
        configPresentWhileWaiting = configPresentWhileWaiting && existsSync(configPath);
        return emptyToolResult(options.args, options.name);
      }
      return emptyToolResult(options.args, options.name);
    });

    await combinedWaiting;
    let settledEarly = false;
    void verifyPromise.then(() => {
      settledEarly = true;
    });
    await Promise.resolve();
    expect(settledEarly).toBe(false);
    expect(configPresentWhileWaiting).toBe(true);
    releaseCombined();
    const result = await verifyPromise;
    expectVerifyFailureText(result, 'no-debugger');
    expect(configPresentWhileWaiting).toBe(true);
    expectEphemeralCleanedUp(ephemeral);
  });

  it('does not treat a late rejection as success when early stages pass', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const message = await combinedRunFailure(cwd, 'combined exploded');
    expect(message).toBe('combined exploded');
  });

  it('records timings for stages that actually ran on early oxlint failure', async () => {
    setEnv(VERIFY_TIMING_ENV, '1');
    try {
      const { result } = await runCleanProjectVerify(
        projects,
        stubVerifyTools({
          oxlint: () => oxlintFailureResult(debuggerDiagnostic()),
        }),
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
