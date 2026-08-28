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
import { handleCodexStop } from '../../hooks/session-stop-hook.js';
import type { CodexStopHookInput } from '../../hooks/session-stop-hook.js';
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
  const cwd = await makeTempDirectory('quality-gate-codex-project-');
  await mkdir(join(cwd, 'src'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'quality-gate-codex-fixture',
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

function stopInput(cwd: string, sessionId: string): CodexStopHookInput {
  return {
    cwd,
    session_id: sessionId,
    transcript_path: join(tmpdir(), 'missing-codex-transcript.jsonl'),
    stop_hook_active: false,
  };
}

function continuationReason(output: Awaited<ReturnType<typeof handleCodexStop>>): string {
  const reason = output.reason;
  if (reason === undefined) {
    throw new Error('expected Stop continuation reason');
  }
  return reason;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('codex stop hook', () => {
  it('returns Stop continuation reason when verify fails', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-codex-fail-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const output = await handleCodexStop(stopInput(cwd, 'codex-stop-fail'), { configPath });

    expect(output.decision).toBe('block');
    expect(continuationReason(output)).toContain('eslint(no-debugger)');
    expect(continuationReason(output)).toContain(
      'Fix only the violations listed below (and any hint: lines)',
    );
    expect(continuationReason(output)).toContain(
      'Apply fixes directly; do not investigate the gate',
    );
    expect(continuationReason(output)).toContain(
      'search prior fixes, transcripts, chats, git history, or gate tooling/config/packages',
    );
    expect(continuationReason(output)).toContain('Then call native or MCP verify again');
  });

  it('escalates on the final persisted attempt and stops after the budget', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-codex-budget-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const input = stopInput(cwd, 'codex-stop-budget');

    for (let attempt = 0; attempt < QUALITY_GATE_FOLLOW_UP_BUDGET - 1; attempt += 1) {
      const continued = await handleCodexStop(input, { configPath });
      expect(continued.decision).toBe('block');
      expect(continuationReason(continued)).toContain('eslint(no-debugger)');
      expect(continuationReason(continued)).not.toContain(
        'Retry budget exhausted. Stop and report the blocker to the user.',
      );
    }

    const escalated = await handleCodexStop(input, { configPath });
    expect(continuationReason(escalated)).toContain('eslint(no-debugger)');
    expect(continuationReason(escalated)).toContain(
      'Retry budget exhausted. Stop and report the blocker to the user.',
    );

    expect(await handleCodexStop(input, { configPath })).toEqual({});
  });

  it('returns empty output when verify passes', async () => {
    const cwd = await createProject('clean-function');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-codex-pass-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const output = await handleCodexStop(stopInput(cwd, 'codex-stop-pass'), { configPath });

    expect(output).toEqual({});
  });

  it('returns empty output for an unconfigured workspace', async () => {
    const cwd = await createProject('debugger-with-export');
    const other = await makeTempDirectory('quality-gate-codex-other-');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-codex-skip-'),
      {
        projects: [{ root: other, entries: ['src/index.ts'] }],
      },
    );

    const output = await handleCodexStop(stopInput(cwd, 'codex-stop-unconfigured'), {
      configPath,
    });

    expect(output).toEqual({});
  });

  it('skips follow-up when the last assistant transcript turn used ask_user_question', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-codex-askq-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const transcriptDir = await makeTempDirectory('quality-gate-codex-askq-transcript-');
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
              name: 'ask_user_question',
              input: { questions: [{ id: 'q', prompt: 'Continue?', options: [] }] },
            },
          ],
        },
      })}\n`,
    );

    expect(
      await handleCodexStop(
        { ...stopInput(cwd, 'codex-stop-askq'), transcript_path: transcriptPath },
        { configPath },
      ),
    ).toEqual({});
  });

  it('skips follow-up when the last assistant transcript turn used request_user_input', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-codex-request-input-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const transcriptDir = await makeTempDirectory('quality-gate-codex-request-input-transcript-');
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
              name: 'request_user_input',
              input: { prompt: 'Continue?' },
            },
          ],
        },
      })}\n`,
    );

    expect(
      await handleCodexStop(
        { ...stopInput(cwd, 'codex-stop-request-input'), transcript_path: transcriptPath },
        { configPath },
      ),
    ).toEqual({});
  });

  it('still follows up when ask_user_question is not in the last assistant turn', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-codex-askq-later-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const transcriptDir = await makeTempDirectory('quality-gate-codex-askq-later-transcript-');
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
              name: 'ask_user_question',
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

    const output = await handleCodexStop(
      { ...stopInput(cwd, 'codex-stop-askq-later'), transcript_path: transcriptPath },
      { configPath },
    );
    expect(output.decision).toBe('block');
    expect(continuationReason(output)).toContain('eslint(no-debugger)');
  });
});
