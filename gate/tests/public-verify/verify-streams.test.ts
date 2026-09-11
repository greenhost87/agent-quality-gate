import { describe, expect, it } from 'bun:test';

import { streamResultFromVerifyResult } from '../../public-verify/verify-streams.js';
import type { VerifyResult } from '../../execute-verify/execute-verify.js';

describe('streamResultFromVerifyResult', () => {
  it('inserts a newline between statusStderr and failure diagnostics when needed', () => {
    const result: VerifyResult = {
      exitCode: 1,
      diagnostics: [
        {
          source: 'oxlint',
          severity: 'error',
          message: 'unexpected debugger statement',
          ruleId: 'no-debugger',
          location: { path: 'src/index.ts', line: 1, column: 1 },
        },
      ],
      statusStderr: 'warning: project config',
    };
    const streams = streamResultFromVerifyResult(result);
    expect(streams.stderr.startsWith('warning: project config\n')).toBe(true);
    expect(streams.stderr).toContain('no-debugger');
    expect(streams.stderr).not.toContain('warning: project configno-debugger');
  });
});
