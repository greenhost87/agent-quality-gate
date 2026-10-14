import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';
import { handleClaudeStop } from '#adapters/hooks/session-stop-hook.js';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import { requiredOutputText } from '#system/tests/support/stop-hook-assertions.js';
import { describeQuestionToolStopScenarios } from '#system/tests/support/stop-hook-question-scenarios.js';
import { createStopHookTestFixtures } from '#system/tests/support/stop-hook-test-fixtures.js';

useIsolatedAgentQualityGateHome();

const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'stop-hook');
const fixtures = createStopHookTestFixtures('claude', FIXTURES_ROOT);
const { stopInput, setupConfiguredProject } = fixtures;

function additionalContext(output: Awaited<ReturnType<typeof handleClaudeStop>>): string {
  return requiredOutputText(
    output.hookSpecificOutput?.additionalContext,
    'expected Stop additionalContext',
  );
}

afterEach(fixtures.cleanup);

describeQuestionToolStopScenarios({
  label: 'claude stop hook',
  fixtures,
  prefix: 'quality-gate-claude',
  sessionPrefix: 'claude-stop',
  questionToolName: 'AskUserQuestion',
  handleStop: handleClaudeStop,
  expectSkipped: (output) => {
    expect(output).toEqual({});
  },
  expectFollowUp: (output) => {
    expect(output.hookSpecificOutput?.hookEventName).toBe('Stop');
    expect(additionalContext(output)).toContain('no-debugger');
  },
});

describe('claude stop hook', () => {
  it('returns empty output when background_tasks is a non-empty array', async () => {
    const { cwd, configPath } = await setupConfiguredProject(
      'debugger-with-export',
      'quality-gate-claude-bg-',
    );

    expect(
      await handleClaudeStop(
        {
          ...stopInput(cwd, 'claude-stop-background'),
          background_tasks: [{ id: 'task-001', type: 'shell' }],
        },
        { configPath },
      ),
    ).toEqual({});
  });
});
