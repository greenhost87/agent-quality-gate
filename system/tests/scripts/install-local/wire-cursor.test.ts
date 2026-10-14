import { describe, expect, it } from 'bun:test';

import { expectSingleAgentQualityGateServer } from './wire-helpers.ts';
import {
  mcpServerConfig,
  stopHookCommand,
  wireHooksDocument,
  wireMcpDocument,
} from '#system/scripts/install-local/wire-harnesses.ts';

describe('wireMcpDocument', () => {
  it('creates mcpServers when the document is empty', () => {
    expectSingleAgentQualityGateServer(
      wireMcpDocument({}, '/opt/aqg/dist/cursor/mcp-server.js'),
      'mcpServers',
      mcpServerConfig('/opt/aqg/dist/cursor/mcp-server.js'),
    );
  });

  it('replaces an existing agent-quality-gate server and keeps siblings', () => {
    const wired = wireMcpDocument(
      {
        mcpServers: {
          other: { command: 'echo' },
          'agent-quality-gate': {
            type: 'stdio',
            command: 'bun',
            args: ['/old/cursor/mcp-server.ts'],
          },
        },
      },
      '/new/mcp-server.js',
    );
    expect(wired).toEqual({
      mcpServers: {
        other: { command: 'echo' },
        'agent-quality-gate': mcpServerConfig('/new/mcp-server.js'),
      },
    });
  });
});

describe('wireHooksDocument', () => {
  it('appends a stop hook when none exists', () => {
    expect(wireHooksDocument({ version: 1, hooks: {} }, '/opt/stop-hook.js')).toEqual({
      version: 1,
      hooks: {
        stop: [
          {
            command: stopHookCommand('/opt/stop-hook.js'),
            timeout: 120,
          },
        ],
      },
    });
  });

  it('updates an existing agent-quality-gate stop hook and keeps others', () => {
    const wired = wireHooksDocument(
      {
        version: 1,
        hooks: {
          stop: [
            { command: './hooks/wezterm-notify.sh' },
            {
              command: 'bun /existing/agent-quality-gate/cursor/stop-hook.ts',
              timeout: 60,
            },
          ],
        },
      },
      '/stable/stop-hook.js',
    );
    expect(wired).toEqual({
      version: 1,
      hooks: {
        stop: [
          { command: './hooks/wezterm-notify.sh' },
          {
            command: stopHookCommand('/stable/stop-hook.js'),
            timeout: 120,
          },
        ],
      },
    });
  });
});
