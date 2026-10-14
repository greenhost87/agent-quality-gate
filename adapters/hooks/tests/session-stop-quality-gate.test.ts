import { describe, expect, it } from 'bun:test';

import { QUALITY_GATE_FOLLOW_UP_BUDGET } from '#system/config/tuning/tuning.js';
import { useExecuteVerifyProjects } from '#system/tests/support/execute-verify-fixture.js';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import { writeYamlConfig } from '#system/tests/support/config-fixtures.js';
import {
  expectBudgetExhaustedText,
  expectFollowUpViolationText,
} from '#system/tests/support/stop-hook-assertions.js';
import { handleSessionStopQualityGate } from '../handle-session-stop-quality-gate.js';

useIsolatedAgentQualityGateHome();

const { createTypeScriptProject, makeTempDirectory } = useExecuteVerifyProjects();

type EngineOutput = { message: string };

function formatMessage(message: string): EngineOutput {
  return { message };
}

function engineMessage(output: EngineOutput | Record<string, never>): string {
  if (!('message' in output)) {
    throw new Error('expected continuation message');
  }
  return output.message;
}

async function runEngine(
  cwd: string,
  sessionId: string,
  configPath: string,
  shouldSkip = false,
): Promise<EngineOutput | Record<string, never>> {
  return handleSessionStopQualityGate(
    { cwd, session_id: sessionId },
    { configPath },
    {
      harness: 'claude',
      shouldSkip: () => shouldSkip,
      formatContinuation: formatMessage,
    },
  );
}

async function expectEmptyEngineOutput(
  cwd: string,
  sessionId: string,
  configPath: string,
  shouldSkip = false,
): Promise<void> {
  expect(await runEngine(cwd, sessionId, configPath, shouldSkip)).toEqual({});
}

async function writeProjectConfig(cwd: string, prefix: string): Promise<string> {
  return writeYamlConfig(await makeTempDirectory(prefix), {
    projects: [{ root: cwd, entries: ['src/index.ts'] }],
  });
}

describe('session stop quality gate engine', () => {
  it('returns the follow-up message when verify fails', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    const configPath = await writeProjectConfig(cwd, 'quality-gate-engine-fail-');

    const output = await runEngine(cwd, 'engine-stop-fail', configPath);

    expectFollowUpViolationText(engineMessage(output));
  });

  it('escalates on the final persisted attempt and stops after the budget', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    const configPath = await writeProjectConfig(cwd, 'quality-gate-engine-budget-');

    for (let attempt = 0; attempt < QUALITY_GATE_FOLLOW_UP_BUDGET - 1; attempt += 1) {
      const continued = await runEngine(cwd, 'engine-stop-budget', configPath);
      const text = engineMessage(continued);
      expect(text).toContain('no-debugger');
      expect(text).not.toContain(
        'Retry budget exhausted. Stop and report the blocker to the user.',
      );
    }

    const escalated = await runEngine(cwd, 'engine-stop-budget', configPath);
    const escalatedText = engineMessage(escalated);
    expect(escalatedText).toContain('no-debugger');
    expectBudgetExhaustedText(escalatedText);

    expect(await runEngine(cwd, 'engine-stop-budget', configPath)).toEqual({});
  });

  for (const scenario of [
    {
      title: 'returns empty output when verify passes',
      source: 'clean-function/src/index.ts',
      configPrefix: 'quality-gate-engine-pass-',
      session: 'engine-stop-pass',
      skipHarness: false,
      configureElsewhere: false,
    },
    {
      title: 'returns empty output for an unconfigured workspace',
      source: 'debugger-with-export/src/index.ts',
      configPrefix: 'quality-gate-engine-skip-',
      session: 'engine-stop-unconfigured',
      skipHarness: false,
      configureElsewhere: true,
    },
    {
      title: 'returns empty output when the harness skips the session',
      source: 'debugger-with-export/src/index.ts',
      configPrefix: 'quality-gate-engine-skipped-',
      session: 'engine-stop-skipped',
      skipHarness: true,
      configureElsewhere: false,
    },
  ]) {
    it(scenario.title, async () => {
      const cwd = await createTypeScriptProject(scenario.source);
      const configRoot = scenario.configureElsewhere
        ? await makeTempDirectory('quality-gate-engine-other-')
        : cwd;
      const configPath = await writeProjectConfig(configRoot, scenario.configPrefix);

      await expectEmptyEngineOutput(cwd, scenario.session, configPath, scenario.skipHarness);
    });
  }
});
