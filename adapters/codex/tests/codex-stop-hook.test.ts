import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';
import { handleCodexStop } from '#adapters/hooks/session-stop-hook.js';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import { requiredOutputText } from '#system/tests/support/stop-hook-assertions.js';
import { describeQuestionToolStopScenarios } from '#system/tests/support/stop-hook-question-scenarios.js';
import { createStopHookTestFixtures } from '#system/tests/support/stop-hook-test-fixtures.js';

useIsolatedAgentQualityGateHome();

const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'stop-hook');
const fixtures = createStopHookTestFixtures('codex', FIXTURES_ROOT);
const { stopInput, setupConfiguredProject, writeTranscriptLines, makeTranscriptPath } = fixtures;

function continuationReason(output: Awaited<ReturnType<typeof handleCodexStop>>): string {
  return requiredOutputText(output.reason, 'expected Stop continuation reason');
}

afterEach(fixtures.cleanup);

describeQuestionToolStopScenarios({
  label: 'codex stop hook',
  fixtures,
  prefix: 'quality-gate-codex',
  sessionPrefix: 'codex-stop',
  questionToolName: 'ask_user_question',
  handleStop: handleCodexStop,
  expectSkipped: (output) => {
    expect(output).toEqual({});
  },
  expectFollowUp: (output) => {
    expect(output.decision).toBe('block');
    expect(continuationReason(output)).toContain('no-debugger');
  },
});

describe('codex stop hook', () => {
  it('skips follow-up when the last assistant transcript turn used request_user_input', async () => {
    const { cwd, configPath } = await setupConfiguredProject(
      'debugger-with-export',
      'quality-gate-codex-request-input-',
    );
    const transcriptPath = await makeTranscriptPath('quality-gate-codex-request-input-transcript-');
    await writeTranscriptLines(transcriptPath, [
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'request_user_input',
              input: { prompt: 'Continue?' },
            },
          ],
        },
      },
    ]);

    expect(
      await handleCodexStop(
        { ...stopInput(cwd, 'codex-stop-request-input'), transcript_path: transcriptPath },
        { configPath },
      ),
    ).toEqual({});
  });
});
