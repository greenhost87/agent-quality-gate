import { join } from 'node:path';
import { writeTextFile } from '../../../process/files/files.js';

import { YAML } from 'bun';

import { readFixture } from '../../../tests/support/fixture-files.js';
import { writeNodeNextProjectScaffold } from '../../../tests/support/project-files.js';
import {
  makeTrackedTempDirectory,
  takeTrackedTempDirectories,
} from '../../../tests/support/tracked-temp-directories.js';

import type {
  QualityGateExtensionApi,
  QualityGateExtensionContext,
} from '../extension-api.types.js';
import type { SessionBranchEntry } from '../session-ask-user.js';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'extension');

export async function makePiTempDirectory(prefix: string): Promise<string> {
  return await makeTrackedTempDirectory(tempDirectories, prefix);
}

export function takePiTempDirectories(): string[] {
  return takeTrackedTempDirectories(tempDirectories);
}

export async function writePiGlobalConfig(directory: string, value: object): Promise<string> {
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(configPath, YAML.stringify(value, null, 2));
  return configPath;
}

export async function createPiProject(
  fixtureCase: 'clean-function' | 'debugger-with-export',
): Promise<string> {
  const source = await readFixture(FIXTURES_ROOT, fixtureCase, 'src/index.ts');
  const cwd = await makePiTempDirectory('quality-gate-pi-project-');
  await writeNodeNextProjectScaffold(cwd, 'pi-fixture');
  await writeTextFile(join(cwd, 'src', 'index.ts'), source);
  return cwd;
}

export function createPiExtensionHost(
  hostOptions: { branch?: readonly SessionBranchEntry[] } = {},
) {
  const subscribed: string[] = [];
  const registeredTools: Array<{
    name: string;
    promptSnippet: string;
    promptGuidelines: string[];
  }> = [];
  const followUps: string[] = [];
  const notifications: string[] = [];
  const sessionStarts: Array<(cwd: string) => Promise<void>> = [];
  const settled: Array<(cwd: string) => Promise<void>> = [];
  let activeTools = ['read', 'bash'];
  let branch: readonly SessionBranchEntry[] = hostOptions.branch ?? [];

  function contextFor(cwd: string): QualityGateExtensionContext {
    return {
      cwd,
      ui: {
        notify: (message) => {
          notifications.push(message);
        },
      },
      sessionManager: {
        getBranch: () => branch,
      },
    };
  }

  const pi: QualityGateExtensionApi = {
    registerTool(definition) {
      registeredTools.push({
        name: definition.name,
        promptSnippet: definition.promptSnippet,
        promptGuidelines: definition.promptGuidelines,
      });
    },
    getActiveTools() {
      return activeTools.slice();
    },
    setActiveTools(names) {
      activeTools = [...names];
    },
    on(event, handler) {
      subscribed.push(event);
      const run = async (cwd: string) => {
        await handler({ reason: 'startup' }, contextFor(cwd));
      };
      if (event === 'session_start') {
        sessionStarts.push(run);
        return;
      }
      settled.push(run);
    },
    sendUserMessage(content, options) {
      if (options?.deliverAs === 'followUp') {
        followUps.push(content);
      }
    },
  };

  async function runHandlers(
    handlers: ReadonlyArray<(cwd: string) => Promise<void>>,
    cwd: string,
  ): Promise<void> {
    for (const handler of handlers.slice()) {
      await handler(cwd);
    }
  }

  return {
    pi,
    subscribed,
    registeredTools,
    followUps,
    notifications,
    setBranch(next: readonly SessionBranchEntry[]) {
      branch = next;
    },
    activeTools() {
      return activeTools.slice();
    },
    async emitSessionStart(cwd: string) {
      await runHandlers(sessionStarts, cwd);
    },
    async emitAgentSettled(cwd: string) {
      await runHandlers(settled, cwd);
    },
  };
}
