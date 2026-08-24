import { describe, expect, it } from 'bun:test';

import {
  codexMcpServerConfig,
  codexStopHookEntry,
  wireCodexConfigDocument,
  wireCodexHooksDocument,
} from '../wire-codex.js';

describe('wireCodexConfigDocument', () => {
  it('creates mcp_servers when the document is empty', () => {
    expect(wireCodexConfigDocument({}, '/opt/aqg/dist/codex/mcp-server.js')).toEqual({
      mcp_servers: {
        'agent-quality-gate': codexMcpServerConfig('/opt/aqg/dist/codex/mcp-server.js'),
      },
    });
  });

  it('replaces an existing agent-quality-gate server and keeps siblings', () => {
    expect(
      wireCodexConfigDocument(
        {
          model: 'gpt-5',
          mcp_servers: {
            other: { command: 'echo' },
            'agent-quality-gate': {
              command: 'bun',
              args: ['/old/codex/mcp-server.ts'],
            },
          },
        },
        '/new/mcp-server.js',
      ),
    ).toEqual({
      model: 'gpt-5',
      mcp_servers: {
        other: { command: 'echo' },
        'agent-quality-gate': codexMcpServerConfig('/new/mcp-server.js'),
      },
    });
  });
});

describe('wireCodexHooksDocument', () => {
  it('appends a Stop hook when none exist', () => {
    expect(wireCodexHooksDocument({}, '/opt/stop-hook.js')).toEqual({
      hooks: {
        Stop: [
          {
            hooks: [codexStopHookEntry('/opt/stop-hook.js')],
          },
        ],
      },
    });
  });

  it('updates existing agent-quality-gate Stop hooks and keeps siblings', () => {
    expect(
      wireCodexHooksDocument(
        {
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
            Stop: [
              { hooks: [{ type: 'command', command: './hooks/wezterm-notify.sh' }] },
              {
                hooks: [
                  {
                    type: 'command',
                    command:
                      'bun /Users/greenhost/develop/ai/agent-quality-gate/codex/stop-hook.ts',
                    timeout: 60,
                  },
                ],
              },
            ],
          },
        },
        '/stable/stop-hook.js',
      ),
    ).toEqual({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
        Stop: [
          { hooks: [{ type: 'command', command: './hooks/wezterm-notify.sh' }] },
          {
            hooks: [codexStopHookEntry('/stable/stop-hook.js')],
          },
        ],
      },
    });
  });
});
