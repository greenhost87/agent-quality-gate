import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeYamlConfig } from './config-fixtures.js';
import { readFixture } from './fixture-files.js';
import { pathExists, readTextFile, writeTextFile } from '#system/process/files/files.js';
import { writeNodeNextProjectScaffold } from './project-files.js';
import {
  makeTrackedTempDirectory,
  removeTrackedTempDirectories,
} from './tracked-temp-directories.js';

export function createStopHookTestFixtures(adapter: string, fixturesRoot: string) {
  const tempDirectories: string[] = [];

  async function makeTempDirectory(prefix: string): Promise<string> {
    return makeTrackedTempDirectory(tempDirectories, prefix);
  }

  async function createProject(
    fixtureCase: 'clean-function' | 'debugger-with-export',
  ): Promise<string> {
    const source = await readFixture(fixturesRoot, fixtureCase, 'src/index.ts');
    const cwd = await makeTempDirectory(`quality-gate-${adapter}-project-`);
    await writeNodeNextProjectScaffold(cwd, `quality-gate-${adapter}-fixture`);
    await writeTextFile(join(cwd, 'src', 'index.ts'), source);
    return cwd;
  }

  function stopInput(
    cwd: string,
    sessionId: string,
  ): {
    cwd: string;
    session_id: string;
    transcript_path: string;
    stop_hook_active: boolean;
  } {
    return {
      cwd,
      session_id: sessionId,
      transcript_path: join(tmpdir(), `missing-${adapter}-transcript.jsonl`),
      stop_hook_active: false,
    };
  }

  async function setupConfiguredProject(
    fixtureCase: 'clean-function' | 'debugger-with-export',
    prefix: string,
  ): Promise<{ cwd: string; configPath: string }> {
    const cwd = await createProject(fixtureCase);
    const configPath = await writeYamlConfig(await makeTempDirectory(prefix), {
      projects: [{ root: cwd, entries: ['src/index.ts'] }],
    });
    return { cwd, configPath };
  }

  function serializeTranscriptLines(entries: readonly object[]): string {
    return entries.map((entry) => `${JSON.stringify(entry)}\n`).join('');
  }

  async function writeTranscriptLines(path: string, entries: readonly object[]): Promise<void> {
    await writeTextFile(path, serializeTranscriptLines(entries));
  }

  async function appendTranscriptLines(path: string, entries: readonly object[]): Promise<void> {
    const previous = (await pathExists(path)) ? await readTextFile(path) : '';
    await writeTextFile(path, `${previous}${serializeTranscriptLines(entries)}`);
  }

  async function makeTranscriptPath(prefix: string): Promise<string> {
    return join(await makeTempDirectory(prefix), 'session.jsonl');
  }

  async function cleanup(): Promise<void> {
    await removeTrackedTempDirectories(tempDirectories);
  }

  return {
    makeTempDirectory,
    writeGlobalConfig: writeYamlConfig,
    createProject,
    stopInput,
    setupConfiguredProject,
    writeTranscriptLines,
    appendTranscriptLines,
    makeTranscriptPath,
    cleanup,
  };
}

function questionToolUse(questionToolName: string): object {
  return {
    type: 'tool_use',
    name: questionToolName,
    input: { questions: [{ id: 'q', prompt: 'Continue?', options: [] }] },
  };
}

export function askQuestionTranscript(questionToolName: string): readonly object[] {
  return [
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Need a decision.' }, questionToolUse(questionToolName)],
      },
    },
  ];
}

export function askQuestionAnsweredTranscript(questionToolName: string): readonly object[] {
  return [
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [questionToolUse(questionToolName)],
      },
    },
    {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'yes' }] },
    },
    {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Continuing.' }] },
    },
  ];
}
