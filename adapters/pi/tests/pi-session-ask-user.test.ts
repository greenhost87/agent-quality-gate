import { afterEach, describe, expect, it } from 'bun:test';

import {
  branchEndsWithAskUser,
  PI_ASK_USER_TOOL_NAME,
  type SessionBranchEntry,
} from '../session-ask-user.js';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.js';
import { removeTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.js';
import { emitPiAgentEnd, setupPiWorkspace, takePiTempDirectories } from './pi-extension-host.js';

useIsolatedAgentQualityGateHome();

afterEach(async () => {
  await removeTrackedTempDirectories(takePiTempDirectories());
});

function assistantBranchEntry(content: readonly object[]): SessionBranchEntry {
  return { type: 'message', message: { role: 'assistant', content: [...content] } };
}

function assistantToolCallEntry(name: string, id: string): SessionBranchEntry {
  return assistantBranchEntry([{ type: 'toolCall', id, name }]);
}

function assistantTextEntry(text: string): SessionBranchEntry {
  return assistantBranchEntry([{ type: 'text', text }]);
}

function toolResultEntry(text: string): SessionBranchEntry {
  return {
    type: 'message',
    message: { role: 'toolResult', content: [{ type: 'text', text }] },
  };
}

describe('pi ask_user completion skip', () => {
  it('skips follow-up when the last assistant branch turn used ask_user', async () => {
    const { cwd, host } = await setupPiWorkspace('quality-gate-pi-ask-', 'debugger-with-export', {
      branch: [assistantToolCallEntry(PI_ASK_USER_TOOL_NAME, 'call_1')],
    });
    expect(await emitPiAgentEnd(host, cwd)).toBe('');
  });

  it('still follows up when ask_user is not in the last assistant turn', async () => {
    const { cwd, host } = await setupPiWorkspace(
      'quality-gate-pi-ask-later-',
      'debugger-with-export',
      {
        branch: [
          assistantToolCallEntry(PI_ASK_USER_TOOL_NAME, 'call_1'),
          toolResultEntry('answered'),
          assistantTextEntry('done'),
        ],
      },
    );
    expect(await emitPiAgentEnd(host, cwd)).toContain('no-debugger');
  });
});

describe('branchEndsWithAskUser', () => {
  it('detects ask_user on the last assistant entry', () => {
    expect(
      branchEndsWithAskUser([
        assistantToolCallEntry('bash', 'c1'),
        assistantToolCallEntry(PI_ASK_USER_TOOL_NAME, 'c2'),
      ]),
    ).toBe(true);
  });

  it('ignores ask_user that is not on the last assistant entry', () => {
    expect(
      branchEndsWithAskUser([
        assistantToolCallEntry(PI_ASK_USER_TOOL_NAME, 'c1'),
        toolResultEntry('ok'),
        assistantTextEntry('continuing'),
      ]),
    ).toBe(false);
  });
});
