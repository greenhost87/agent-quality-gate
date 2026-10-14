import { describe, expect, it } from 'bun:test';
import {
  debuggerDiagnostic,
  emptyToolResult,
  ephemeralConfigDirs,
  expectEphemeralCleanedUp,
  fixtureVerifyRequest,
  oxlintFailureResult,
  oxlintStderrResult,
  stubVerifyTools,
} from './verify-phases-helpers.js';

import { executeVerify } from '#system/gate/run/execute-verify.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  runCleanProjectVerify,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';
import { checkPresentedText } from '#system/tests/support/verify-result-text.ts';
import { expectVerifyFailureText } from '#system/tests/support/verify-assertions.ts';

useIsolatedAgentQualityGateHome();
const projects = useExecuteVerifyProjects();
const { createTypeScriptProject, runVerifyWithLauncher } = projects;

describe('verify phases ephemeral configs', () => {
  it('removes ephemeral configs after oxlint failure', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    const result = await runVerifyWithLauncher(
      cwd,
      stubVerifyTools({ oxlint: () => oxlintFailureResult(debuggerDiagnostic()) }),
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expectVerifyFailureText(result, 'no-debugger');
    expectEphemeralCleanedUp(ephemeral);
  });

  it('removes ephemeral configs after oxlint timeout', async () => {
    const { cwd, result } = await runCleanProjectVerify(
      projects,
      stubVerifyTools({ oxlint: () => oxlintStderrResult(1, 'hint:type-aware-timeout\n') }),
    );
    const ephemeral = ephemeralConfigDirs(cwd);

    expect(result.exitCode).toBe(1);
    expect(checkPresentedText(result)).toContain('hint:type-aware-timeout');
    expect(result.statusStderr ?? '').toContain('hint:type-aware-timeout');
    expectEphemeralCleanedUp(ephemeral);
  });

  it('removes ephemeral configs when a tool runner throws', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    let thrownMessage = '';
    try {
      await executeVerify(fixtureVerifyRequest(cwd), async (options) => {
        await Promise.resolve();
        if (options.name === 'oxlint') {
          throw new Error('oxlint exploded');
        }
        return emptyToolResult(options.args, options.name);
      });
    } catch (error) {
      thrownMessage = error instanceof Error ? error.message : String(error);
    }
    expect(thrownMessage).toBe('oxlint exploded');
    const ephemeral = ephemeralConfigDirs(cwd);
    expectEphemeralCleanedUp(ephemeral);
  });
});
