import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../../process/files/files.js';

import { YAML } from 'bun';

import { readFixture } from '../../../tests/support/fixture-files.js';

import type {
  QualityGateExtensionApi,
  QualityGateExtensionContext,
} from '../extension-api.types.js';
import type { SessionBranchEntry } from '../session-ask-user.types.js';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'extension');

export async function makePiTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

export function takePiTempDirectories(): string[] {
  return tempDirectories.splice(0);
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
  await mkdir(join(cwd, 'src'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'pi-fixture', private: true, type: 'module', main: 'src/index.ts' }, null, 2)}\n`,
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
      for (const handler of sessionStarts.slice()) {
        await handler(cwd);
      }
    },
    async emitAgentSettled(cwd: string) {
      for (const handler of settled.slice()) {
        await handler(cwd);
      }
    },
  };
}
