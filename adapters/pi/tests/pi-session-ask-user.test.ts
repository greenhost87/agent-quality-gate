import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'bun:test';

import { registerQualityGate } from '../register-quality-gate.js';
import { branchEndsWithAskUser, PI_ASK_USER_TOOL_NAME } from '../session-ask-user.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  createPiExtensionHost,
  createPiProject,
  makePiTempDirectory,
  takePiTempDirectories,
  writePiGlobalConfig,
} from './pi-extension-host.js';

useIsolatedAgentQualityGateHome();

afterEach(async () => {
  await Promise.all(
    takePiTempDirectories().map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('pi ask_user settle skip', () => {
  it('skips follow-up when the last assistant branch turn used ask_user', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-ask-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const host = createPiExtensionHost({
      branch: [
        {
          type: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'call_1', name: PI_ASK_USER_TOOL_NAME }],
          },
        },
      ],
    });

    registerQualityGate(host.pi, { configPath });
    await host.emitSessionStart(cwd);
    await host.emitAgentSettled(cwd);

    expect(host.followUps).toEqual([]);
  });

  it('still follows up when ask_user is not in the last assistant turn', async () => {
    const cwd = await createPiProject('debugger-with-export');
    const configPath = await writePiGlobalConfig(
      await makePiTempDirectory('quality-gate-pi-ask-later-'),
      {
        projects: [{ root: cwd, entries: ['src/index.ts'] }],
      },
    );
    const host = createPiExtensionHost({
      branch: [
        {
          type: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'call_1', name: PI_ASK_USER_TOOL_NAME }],
          },
        },
        {
          type: 'message',
          message: {
            role: 'toolResult',
            content: [{ type: 'text', text: 'answered' }],
          },
        },
        {
          type: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'done' }],
          },
        },
      ],
    });

    registerQualityGate(host.pi, { configPath });
    await host.emitSessionStart(cwd);
    await host.emitAgentSettled(cwd);

    expect(host.followUps.join('\n')).toContain('eslint(no-debugger)');
  });
});

describe('branchEndsWithAskUser', () => {
  it('detects ask_user on the last assistant entry', () => {
    expect(
      branchEndsWithAskUser([
        {
          type: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'c1', name: 'bash' }],
          },
        },
        {
          type: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'c2', name: PI_ASK_USER_TOOL_NAME }],
          },
        },
      ]),
    ).toBe(true);
  });

  it('ignores ask_user that is not on the last assistant entry', () => {
    expect(
      branchEndsWithAskUser([
        {
          type: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'c1', name: PI_ASK_USER_TOOL_NAME }],
          },
        },
        {
          type: 'message',
          message: {
            role: 'toolResult',
            content: [{ type: 'text', text: 'ok' }],
          },
        },
        {
          type: 'message',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'continuing' }],
          },
        },
      ]),
    ).toBe(false);
  });
});
