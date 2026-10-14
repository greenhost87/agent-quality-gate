import { mkdir } from 'node:fs/promises';

import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  handleCursorStop,
  parseCursorStopInput,
  selectWorkspaceCwd,
  type CursorStopHookInput,
} from '../stop-hook.js';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import {
  expectBudgetExhaustedText,
  expectFollowUpViolationText,
} from '#system/tests/support/stop-hook-assertions.js';

import { createStopHookTestFixtures } from '#system/tests/support/stop-hook-test-fixtures.js';

useIsolatedAgentQualityGateHome();

it('normalizes absent and null transcript paths at the input boundary', () => {
  const base: CursorStopHookInput = { status: 'completed', workspace_roots: [] };
  expect(parseCursorStopInput(base)?.transcript_path).toBeUndefined();
  expect(parseCursorStopInput({ ...base, transcript_path: null })).toEqual({
    ...base,
    transcript_path: undefined,
  });
  expect(
    parseCursorStopInput({ ...base, transcript_path: '/tmp/transcript' })?.transcript_path,
  ).toBe('/tmp/transcript');
  expect(parseCursorStopInput({ ...base, transcript_path: 12 })).toBeUndefined();
});

const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'stop-hook');
const fixtures = createStopHookTestFixtures('cursor', FIXTURES_ROOT);
const {
  makeTempDirectory,
  writeGlobalConfig,
  createProject,
  setupConfiguredProject,
  writeTranscriptLines,
  makeTranscriptPath,
} = fixtures;

async function expectEmptyCursorStop(cwd: string, configPath: string): Promise<void> {
  const output = await handleCursorStop(
    { status: 'completed', workspace_roots: [cwd] },
    { configPath },
  );
  expect(output).toEqual({});
}

function askQuestionToolUse(): object {
  return {
    type: 'tool_use',
    name: 'AskQuestion',
    input: { questions: [{ id: 'q', prompt: 'Continue?', options: [] }] },
  };
}

async function expectNoWorkspaceCwd(
  roots: string[],
  configuredRoot: string,
  prefix: string,
): Promise<void> {
  const configPath = await writeGlobalConfig(await makeTempDirectory(prefix), {
    projects: [{ root: configuredRoot, entries: ['src/index.ts'] }],
  });
  expect(await selectWorkspaceCwd(roots, { configPath })).toBeUndefined();
}

afterEach(fixtures.cleanup);

describe('cursor stop hook', () => {
  it('returns followup_message when status is completed and verify fails', async () => {
    const { cwd, configPath } = await setupConfiguredProject(
      'debugger-with-export',
      'quality-gate-cursor-fail-',
    );

    const output = await handleCursorStop(
      { status: 'completed', workspace_roots: [cwd] },
      { configPath },
    );

    expect(output.followup_message).toBeDefined();
    expectFollowUpViolationText(output.followup_message);
  });

  it('escalates on the final loop_count and stops after the budget', async () => {
    const { cwd, configPath } = await setupConfiguredProject(
      'debugger-with-export',
      'quality-gate-cursor-budget-',
    );

    const escalated = await handleCursorStop(
      { status: 'completed', workspace_roots: [cwd], loop_count: 2 },
      { configPath },
    );
    expect(escalated.followup_message).toContain('no-debugger');
    expectBudgetExhaustedText(escalated.followup_message);

    expect(
      await handleCursorStop(
        { status: 'completed', workspace_roots: [cwd], loop_count: 3 },
        { configPath },
      ),
    ).toEqual({});
  });

  it('returns empty output when verify passes', async () => {
    const { cwd, configPath } = await setupConfiguredProject(
      'clean-function',
      'quality-gate-cursor-pass-',
    );

    await expectEmptyCursorStop(cwd, configPath);
  });

  it('returns empty output for unconfigured workspace roots', async () => {
    const cwd = await createProject('debugger-with-export');
    const other = await makeTempDirectory('quality-gate-cursor-other-');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-cursor-skip-'),
      {
        projects: [{ root: other, entries: ['src/index.ts'] }],
      },
    );

    await expectEmptyCursorStop(cwd, configPath);
  });

  it('returns empty output when status is aborted or error', async () => {
    const { cwd, configPath } = await setupConfiguredProject(
      'debugger-with-export',
      'quality-gate-cursor-status-',
    );

    expect(
      await handleCursorStop({ status: 'aborted', workspace_roots: [cwd] }, { configPath }),
    ).toEqual({});
    expect(
      await handleCursorStop({ status: 'error', workspace_roots: [cwd] }, { configPath }),
    ).toEqual({});
  });

  it('skips follow-up when the last assistant transcript turn used AskQuestion', async () => {
    const { cwd, configPath } = await setupConfiguredProject(
      'debugger-with-export',
      'quality-gate-cursor-askq-',
    );
    const transcriptPath = await makeTranscriptPath('quality-gate-cursor-askq-transcript-');
    await writeTranscriptLines(transcriptPath, [
      {
        role: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Need a decision.' }, askQuestionToolUse()],
        },
      },
    ]);

    expect(
      await handleCursorStop(
        { status: 'completed', workspace_roots: [cwd], transcript_path: transcriptPath },
        { configPath },
      ),
    ).toEqual({});
  });

  it('still follows up when AskQuestion is not in the last assistant turn', async () => {
    const { cwd, configPath } = await setupConfiguredProject(
      'debugger-with-export',
      'quality-gate-cursor-askq-later-',
    );
    const transcriptPath = await makeTranscriptPath('quality-gate-cursor-askq-later-transcript-');
    await writeTranscriptLines(transcriptPath, [
      {
        role: 'assistant',
        message: { content: [askQuestionToolUse()] },
      },
      {
        role: 'user',
        message: { content: [{ type: 'text', text: 'yes' }] },
      },
      {
        role: 'assistant',
        message: { content: [{ type: 'text', text: 'Continuing.' }] },
      },
    ]);

    const output = await handleCursorStop(
      { status: 'completed', workspace_roots: [cwd], transcript_path: transcriptPath },
      { configPath },
    );
    expect(output.followup_message).toBeDefined();
    expect(output.followup_message).toContain('no-debugger');
  });

  it('skips workspaces that do not exactly match a configured project root', async () => {
    // A configured root listed alongside an unlisted root.
    const configured = await createProject('clean-function');
    const other = await makeTempDirectory('quality-gate-cursor-unlisted-');
    await expectNoWorkspaceCwd([other, configured], configured, 'quality-gate-cursor-roots-');

    // A parent workspace containing a configured project.
    const workspace = await makeTempDirectory('quality-gate-cursor-parent-');
    const nestedProject = join(workspace, 'configured-project');
    await mkdir(nestedProject);
    await expectNoWorkspaceCwd([workspace], nestedProject, 'quality-gate-cursor-parent-config-');

    // A workspace rooted inside a configured project.
    const nested = join(configured, 'src');
    await expectNoWorkspaceCwd([nested], configured, 'quality-gate-cursor-nested-config-');
  });
});
