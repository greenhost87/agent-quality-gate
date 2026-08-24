import { describe, expect, it } from 'bun:test';

import { mcpServerConfig, wireMcpDocument } from '../wire-cursor.js';
import { stopHookConfig, wireClaudeSettingsDocument } from '../wire-claude.js';

describe('wireMcpDocument for Claude user-scope config', () => {
  it('creates mcpServers when the document is empty', () => {
    expect(wireMcpDocument({}, '/opt/aqg/dist/claude/mcp-server.js')).toEqual({
      mcpServers: {
        'agent-quality-gate': mcpServerConfig('/opt/aqg/dist/claude/mcp-server.js'),
      },
    });
  });

  it('replaces an existing agent-quality-gate server and keeps siblings', () => {
    const wired = wireMcpDocument(
      {
        projects: { '/tmp/app': { allowedTools: [] } },
        mcpServers: {
          other: { command: 'echo' },
          'agent-quality-gate': {
            type: 'stdio',
            command: 'bun',
            args: ['/old/claude/mcp-server.ts'],
          },
        },
      },
      '/new/mcp-server.js',
    );
    expect(wired).toEqual({
      projects: { '/tmp/app': { allowedTools: [] } },
      mcpServers: {
        other: { command: 'echo' },
        'agent-quality-gate': mcpServerConfig('/new/mcp-server.js'),
      },
    });
  });
});

describe('wireClaudeSettingsDocument', () => {
  it('appends an exec-form Stop hook and verify permission when none exist', () => {
    expect(wireClaudeSettingsDocument({}, '/opt/stop-hook.js')).toEqual({
      hooks: {
        Stop: [
          {
            hooks: [stopHookConfig('/opt/stop-hook.js')],
          },
        ],
      },
      permissions: {
        allow: ['mcp__agent-quality-gate__verify'],
      },
    });
  });

  it('updates existing agent-quality-gate Stop hooks and keeps siblings', () => {
    const wired = wireClaudeSettingsDocument(
      {
        permissions: {
          allow: ['Bash(npm test *)', 'mcp__agent-quality-gate__verify'],
          deny: ['Bash(rm *)'],
        },
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
          Stop: [
            { hooks: [{ type: 'command', command: './hooks/wezterm-notify.sh' }] },
            {
              hooks: [
                {
                  type: 'command',
                  command: 'bun /Users/greenhost/develop/ai/agent-quality-gate/claude/stop-hook.ts',
                  timeout: 60,
                },
              ],
            },
          ],
        },
      },
      '/stable/stop-hook.js',
    );
    expect(wired).toEqual({
      permissions: {
        allow: ['Bash(npm test *)', 'mcp__agent-quality-gate__verify'],
        deny: ['Bash(rm *)'],
      },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
        Stop: [
          { hooks: [{ type: 'command', command: './hooks/wezterm-notify.sh' }] },
          {
            hooks: [stopHookConfig('/stable/stop-hook.js')],
          },
        ],
      },
    });
  });
});
