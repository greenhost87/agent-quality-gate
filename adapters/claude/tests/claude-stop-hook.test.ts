import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathExists, readTextFile, writeTextFile } from '../../../process/files/files.js';

async function appendTextFile(path: string, contents: string): Promise<void> {
  const previous = (await pathExists(path)) ? await readTextFile(path) : '';
  await writeTextFile(path, `${previous}${contents}`);
}

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { handleClaudeStop } from '../../hooks/session-stop-hook.js';
import type { ClaudeStopHookInput } from '../stop-hook.types.js';
import { QUALITY_GATE_FOLLOW_UP_BUDGET } from '../../../gate/quality-gate-run/quality-gate-run.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import { readFixture } from '../../../tests/support/fixture-files.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'stop-hook');

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeGlobalConfig(directory: string, value: object): Promise<string> {
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(configPath, YAML.stringify(value, null, 2));
  return configPath;
}

async function createProject(
  fixtureCase: 'clean-function' | 'debugger-with-export',
): Promise<string> {
  const source = await readFixture(FIXTURES_ROOT, fixtureCase, 'src/index.ts');
  const cwd = await makeTempDirectory('quality-gate-claude-project-');
  await mkdir(join(cwd, 'src'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'quality-gate-claude-fixture',
        private: true,
        type: 'module',
        main: 'src/index.ts',
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(join(cwd, 'src', 'index.ts'), source);
  return cwd;
}

function stopInput(cwd: string, sessionId: string): ClaudeStopHookInput {
  return {
    cwd,
    session_id: sessionId,
    transcript_path: join(tmpdir(), 'missing-claude-transcript.jsonl'),
    stop_hook_active: false,
  };
}

function additionalContext(output: Awaited<ReturnType<typeof handleClaudeStop>>): string {
  const context = output.hookSpecificOutput?.additionalContext;
  if (context === undefined) {
    throw new Error('expected Stop additionalContext');
  }
  return context;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('claude stop hook', () => {
  it('returns Stop additionalContext when verify fails', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-fail-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const output = await handleClaudeStop(stopInput(cwd, 'claude-stop-fail'), { configPath });

    expect(output.hookSpecificOutput?.hookEventName).toBe('Stop');
    expect(additionalContext(output)).toContain('eslint(no-debugger)');
    expect(additionalContext(output)).toContain(
      'Fix only the violations listed below (and any hint: lines)',
    );
    expect(additionalContext(output)).toContain('Do not investigate why the gate complains');
    expect(additionalContext(output)).toContain(
      'Do not dig into prior verify fixes, agent transcripts, other chat sessions, or git history',
    );
    expect(additionalContext(output)).toContain(
      'Do not search for verify binaries, fallow/jscpd config, agent-quality-gate packages',
    );
  });

  it('escalates on the final persisted attempt and stops after the budget', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-budget-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const input = stopInput(cwd, 'claude-stop-budget');

    for (let attempt = 0; attempt < QUALITY_GATE_FOLLOW_UP_BUDGET - 1; attempt += 1) {
      const continued = await handleClaudeStop(input, { configPath });
      expect(continued.hookSpecificOutput?.hookEventName).toBe('Stop');
      expect(additionalContext(continued)).toContain('eslint(no-debugger)');
      expect(additionalContext(continued)).not.toContain(
        'Retry budget exhausted. Stop and report the blocker to the user.',
      );
    }

    const escalated = await handleClaudeStop(input, { configPath });
    expect(additionalContext(escalated)).toContain('eslint(no-debugger)');
    expect(additionalContext(escalated)).toContain(
      'Retry budget exhausted. Stop and report the blocker to the user.',
    );

    expect(await handleClaudeStop(input, { configPath })).toEqual({});
  });

  it('returns empty output when verify passes', async () => {
    const cwd = await createProject('clean-function');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-pass-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const output = await handleClaudeStop(stopInput(cwd, 'claude-stop-pass'), { configPath });

    expect(output).toEqual({});
  });

  it('returns empty output for an unconfigured workspace', async () => {
    const cwd = await createProject('debugger-with-export');
    const other = await makeTempDirectory('quality-gate-claude-other-');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-skip-'),
      {
        projects: [{ root: other, entries: ['src/index.ts'] }],
      },
    );

    const output = await handleClaudeStop(stopInput(cwd, 'claude-stop-unconfigured'), {
      configPath,
    });

    expect(output).toEqual({});
  });

  it('skips follow-up when the last assistant transcript turn used AskUserQuestion', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-askq-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const transcriptDir = await makeTempDirectory('quality-gate-claude-askq-transcript-');
    const transcriptPath = join(transcriptDir, 'session.jsonl');
    await writeTextFile(
      transcriptPath,
      `${JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Need a decision.' },
            {
              type: 'tool_use',
              name: 'AskUserQuestion',
              input: { questions: [{ id: 'q', prompt: 'Continue?', options: [] }] },
            },
          ],
        },
      })}\n`,
    );

    expect(
      await handleClaudeStop(
        { ...stopInput(cwd, 'claude-stop-askq'), transcript_path: transcriptPath },
        { configPath },
      ),
    ).toEqual({});
  });

  it('still follows up when AskUserQuestion is not in the last assistant turn', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-claude-askq-later-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const transcriptDir = await makeTempDirectory('quality-gate-claude-askq-later-transcript-');
    const transcriptPath = join(transcriptDir, 'session.jsonl');
    await writeTextFile(
      transcriptPath,
      `${JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'AskUserQuestion',
              input: { questions: [{ id: 'q', prompt: 'Continue?', options: [] }] },
            },
          ],
        },
      })}\n`,
    );
    await appendTextFile(
      transcriptPath,
      `${JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'yes' }] },
      })}\n`,
    );
    await appendTextFile(
      transcriptPath,
      `${JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Continuing.' }] },
      })}\n`,
    );

    const output = await handleClaudeStop(
      { ...stopInput(cwd, 'claude-stop-askq-later'), transcript_path: transcriptPath },
      { configPath },
    );
    expect(output.hookSpecificOutput?.hookEventName).toBe('Stop');
    expect(additionalContext(output)).toContain('eslint(no-debugger)');
  });

  it('returns empty output when background_tasks is a non-empty array', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(await makeTempDirectory('quality-gate-claude-bg-'), {
      projects: [{ root: cwd, entries: ['src/index.ts'] }],
    });

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
