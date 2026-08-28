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
import { handleCursorStop, selectWorkspaceCwd } from '../stop-hook.js';
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
  const cwd = await makeTempDirectory('quality-gate-cursor-project-');
  await mkdir(join(cwd, 'src'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'quality-gate-cursor-fixture',
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

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('cursor stop hook', () => {
  it('returns followup_message when status is completed and verify fails', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-cursor-fail-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const output = await handleCursorStop(
      { status: 'completed', workspace_roots: [cwd] },
      { configPath },
    );

    expect(output.followup_message).toBeDefined();
    expect(output.followup_message).toContain('eslint(no-debugger)');
    expect(output.followup_message).toContain(
      'Fix only the violations listed below (and any hint: lines)',
    );
    expect(output.followup_message).toContain('Apply fixes directly; do not investigate the gate');
    expect(output.followup_message).toContain(
      'search prior fixes, transcripts, chats, git history, or gate tooling/config/packages',
    );
    expect(output.followup_message).toContain('Then call native or MCP verify again');
  });

  it('escalates on the final loop_count and stops after the budget', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-cursor-budget-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const escalated = await handleCursorStop(
      { status: 'completed', workspace_roots: [cwd], loop_count: 2 },
      { configPath },
    );
    expect(escalated.followup_message).toContain('eslint(no-debugger)');
    expect(escalated.followup_message).toContain(
      'Retry budget exhausted. Stop and report the blocker to the user.',
    );

    expect(
      await handleCursorStop(
        { status: 'completed', workspace_roots: [cwd], loop_count: 3 },
        { configPath },
      ),
    ).toEqual({});
  });

  it('returns empty output when verify passes', async () => {
    const cwd = await createProject('clean-function');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-cursor-pass-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    const output = await handleCursorStop(
      { status: 'completed', workspace_roots: [cwd] },
      { configPath },
    );

    expect(output).toEqual({});
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

    const output = await handleCursorStop(
      { status: 'completed', workspace_roots: [cwd] },
      { configPath },
    );

    expect(output).toEqual({});
  });

  it('returns empty output when status is aborted or error', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-cursor-status-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );

    expect(
      await handleCursorStop({ status: 'aborted', workspace_roots: [cwd] }, { configPath }),
    ).toEqual({});
    expect(
      await handleCursorStop({ status: 'error', workspace_roots: [cwd] }, { configPath }),
    ).toEqual({});
  });

  it('skips follow-up when the last assistant transcript turn used AskQuestion', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-cursor-askq-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const transcriptDir = await makeTempDirectory('quality-gate-cursor-askq-transcript-');
    const transcriptPath = join(transcriptDir, 'session.jsonl');
    await writeTextFile(
      transcriptPath,
      `${JSON.stringify({
        role: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Need a decision.' },
            {
              type: 'tool_use',
              name: 'AskQuestion',
              input: { questions: [{ id: 'q', prompt: 'Continue?', options: [] }] },
            },
          ],
        },
      })}\n`,
    );

    expect(
      await handleCursorStop(
        { status: 'completed', workspace_roots: [cwd], transcript_path: transcriptPath },
        { configPath },
      ),
    ).toEqual({});
  });

  it('still follows up when AskQuestion is not in the last assistant turn', async () => {
    const cwd = await createProject('debugger-with-export');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-cursor-askq-later-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const transcriptDir = await makeTempDirectory('quality-gate-cursor-askq-later-transcript-');
    const transcriptPath = join(transcriptDir, 'session.jsonl');
    await writeTextFile(
      transcriptPath,
      `${JSON.stringify({
        role: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'AskQuestion',
              input: { questions: [{ id: 'q', prompt: 'Continue?', options: [] }] },
            },
          ],
        },
      })}\n`,
    );
    await appendTextFile(
      transcriptPath,
      `${JSON.stringify({
        role: 'user',
        message: { content: [{ type: 'text', text: 'yes' }] },
      })}\n`,
    );
    await appendTextFile(
      transcriptPath,
      `${JSON.stringify({
        role: 'assistant',
        message: { content: [{ type: 'text', text: 'Continuing.' }] },
      })}\n`,
    );

    const output = await handleCursorStop(
      { status: 'completed', workspace_roots: [cwd], transcript_path: transcriptPath },
      { configPath },
    );
    expect(output.followup_message).toBeDefined();
    expect(output.followup_message).toContain('eslint(no-debugger)');
  });

  it('selects the configured workspace root among multiple roots', async () => {
    const configured = await createProject('clean-function');
    const other = await makeTempDirectory('quality-gate-cursor-unlisted-');
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('quality-gate-cursor-roots-'),
      {
        projects: [{ root: configured, entries: ['src/index.ts'] }],
      },
    );

    expect(await selectWorkspaceCwd([other, configured], { configPath })).toBe(configured);
  });
});
