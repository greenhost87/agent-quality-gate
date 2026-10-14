import { join } from 'node:path';
import { expect } from 'bun:test';
import { writeTextFile } from '#system/process/files/files.js';
import { VERIFY_TOOL_NAME } from '#adapters/hooks/verify-tool-name.js';

import { projectConfig, writeYamlConfig } from '#system/tests/support/config-fixtures.js';
import { readFixture } from '#system/tests/support/fixture-files.js';
import {
  findProjectForCwd,
  readGlobalQualityGateConfig,
} from '#system/config/global-config/global-config.js';
import { writeNodeNextProjectScaffold } from '#system/tests/support/project-files.js';
import {
  makeTrackedTempDirectory,
  takeTrackedTempDirectories,
} from '#system/tests/support/tracked-temp-directories.js';
import { registerQualityGate } from '../register-quality-gate.js';

import type {
  AgentEndEvent,
  QualityGateExtensionApi,
  QualityGateExtensionContext,
  QualityGateToolDefinition,
} from '../extension-api.types.js';
import type { SessionBranchEntry } from '../session-ask-user.js';

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '.quality-fixtures', 'extension');

export async function makePiTempDirectory(prefix: string): Promise<string> {
  return await makeTrackedTempDirectory(tempDirectories, prefix);
}

export function takePiTempDirectories(): string[] {
  return takeTrackedTempDirectories(tempDirectories);
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

export async function requireAllowlistedProject(cwd: string, configPath: string) {
  const project = findProjectForCwd(cwd, (await readGlobalQualityGateConfig(configPath)).projects);
  if (project === undefined) {
    throw new Error('expected allowlisted project');
  }
  return project;
}

export async function setupAllowlistedProject(
  fixtureCase: 'clean-function' | 'debugger-with-export',
  prefix: string,
) {
  const cwd = await createPiProject(fixtureCase);
  const configPath = await writeYamlConfig(await makePiTempDirectory(prefix), projectConfig(cwd));
  const project = await requireAllowlistedProject(cwd, configPath);
  return { cwd, configPath, project };
}

export function registerPiHost(
  configPath: string,
  hostOptions: { branch?: readonly SessionBranchEntry[] } = {},
) {
  const host = createPiExtensionHost(hostOptions);
  registerQualityGate(host.pi, { configPath });
  return host;
}

export function expectPiSessionBound(host: {
  subscribed: string[];
  registeredTools: Array<{ name: string }>;
}): void {
  expect(host.subscribed).toEqual(['session_start', 'agent_end']);
  expect(host.registeredTools.map((tool) => tool.name)).toEqual([VERIFY_TOOL_NAME]);
}

export async function emitPiAgentEnd(
  host: { emitAgentEnd: (cwd: string) => Promise<void>; followUps: string[] },
  cwd: string,
): Promise<string> {
  await host.emitAgentEnd(cwd);
  return host.followUps.join('\n');
}

export async function setupUnconfiguredPiHost(prefix: string, root: string) {
  const configPath = await writeYamlConfig(await makePiTempDirectory(prefix), projectConfig(root));
  return registerPiHost(configPath);
}

export async function setupPiWorkspace(
  prefix: string,
  fixtureCase: 'clean-function' | 'debugger-with-export' = 'debugger-with-export',
  hostOptions: { branch?: readonly SessionBranchEntry[] } = {},
): Promise<{
  cwd: string;
  configPath: string;
  host: ReturnType<typeof createPiExtensionHost>;
}> {
  const cwd = await createPiProject(fixtureCase);
  const configPath = await writeYamlConfig(await makePiTempDirectory(prefix), projectConfig(cwd));
  const host = registerPiHost(configPath, hostOptions);
  await host.emitSessionStart(cwd);
  return { cwd, configPath, host };
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
  const toolDefinitions: QualityGateToolDefinition[] = [];
  const followUps: string[] = [];
  const notifications: string[] = [];
  const sessionStarts: Array<(cwd: string, reason: 'startup' | 'reload') => Promise<void>> = [];
  const agentEnds: Array<(cwd: string, event: AgentEndEvent) => Promise<void>> = [];
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
      toolDefinitions.push(definition);
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
      if (event === 'session_start') {
        sessionStarts.push(async (cwd, reason) => {
          await handler({ reason }, contextFor(cwd));
        });
        return;
      }
      agentEnds.push(async (cwd, agentEnd) => {
        await handler(agentEnd, contextFor(cwd));
      });
    },
    sendMessage(message, _options) {
      followUps.push(message.content);
    },
  };

  async function runSessionStartHandlers(cwd: string, reason: 'startup' | 'reload'): Promise<void> {
    for (const handler of sessionStarts.slice()) {
      await handler(cwd, reason);
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
    async executeTool(name: string, cwd: string) {
      const definition = toolDefinitions.find((tool) => tool.name === name);
      if (definition === undefined) {
        throw new Error(`tool not registered: ${name}`);
      }
      return await definition.execute(
        'test-tool-call',
        {},
        new AbortController().signal,
        undefined,
        contextFor(cwd),
      );
    },
    async emitSessionStart(cwd: string, reason: 'startup' | 'reload' = 'startup') {
      await runSessionStartHandlers(cwd, reason);
    },
    async emitAgentEnd(cwd: string, stopReason = 'stop') {
      const event: AgentEndEvent = {
        messages: [{ role: 'assistant', stopReason }],
      };
      for (const handler of agentEnds.slice()) {
        await handler(cwd, event);
      }
    },
  };
}
