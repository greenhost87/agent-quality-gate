import { describe, expect, it, mock } from 'bun:test';

import type { VerifyStep } from '../../src/verify/index.js';

interface FailureFixture {
  stepName: VerifyStep['name'];
  output: string;
  expectedDiagnostic: string;
  unexpectedDiagnostic: string;
}

const FAILURE_FIXTURES: FailureFixture[] = [
  {
    stepName: 'protected-coverage',
    output: ['verify: failed to compute coverage targets: git command failed', 'verify: debug coverage eslint=42'].join(
      '\n'
    ),
    expectedDiagnostic: 'verify: failed to compute coverage targets: git command failed',
    unexpectedDiagnostic: 'verify: debug coverage eslint=42',
  },
  {
    stepName: 'eslint',
    output: [
      '/repo/extensions/sample.ts',
      '10:7  error  Unexpected any. Specify a different type',
      '12:3  error  Another lint failure',
    ].join('\n'),
    expectedDiagnostic: ['/repo/extensions/sample.ts', '10:7  error  Unexpected any. Specify a different type'].join(
      '\n'
    ),
    unexpectedDiagnostic: '12:3  error  Another lint failure',
  },
  {
    stepName: 'markdown-headings',
    output: [
      'docs/usage.md',
      '4:3 error Duplicate markdown heading "Usage" (first defined at 1:3)',
      '8:3 error Duplicate markdown heading "Usage" (first defined at 1:3)',
    ].join('\n'),
    expectedDiagnostic: ['docs/usage.md', '4:3 error Duplicate markdown heading "Usage" (first defined at 1:3)'].join(
      '\n'
    ),
    unexpectedDiagnostic: '8:3 error Duplicate markdown heading "Usage" (first defined at 1:3)',
  },
  {
    stepName: 'tsc',
    output: [
      "extensions/agent-team/index.ts(42,13): error TS2322: Type 'string' is not assignable to type 'number'.",
      "extensions/agent-team/index.ts(48,1): error TS6133: 'unused' is declared but its value is never read.",
    ].join('\n'),
    expectedDiagnostic:
      "extensions/agent-team/index.ts(42,13): error TS2322: Type 'string' is not assignable to type 'number'.",
    unexpectedDiagnostic:
      "extensions/agent-team/index.ts(48,1): error TS6133: 'unused' is declared but its value is never read.",
  },
  {
    stepName: 'duplicate-shapes',
    output: [
      'Duplicate or near-duplicate exported object shapes detected:',
      '- similarity=0.95 | ModelLike (src/a.ts) <-> RuntimeModelLike (src/b.ts)',
      '- similarity=0.93 | ApiPayload (src/c.ts) <-> EventPayload (src/d.ts)',
    ].join('\n'),
    expectedDiagnostic: 'Duplicate or near-duplicate exported object shapes detected:',
    unexpectedDiagnostic: '- similarity=0.95 | ModelLike (src/a.ts) <-> RuntimeModelLike (src/b.ts)',
  },
  {
    stepName: 'depcruise',
    output: [
      'error no-circular: src/domain/a.ts -> src/domain/b.ts -> src/domain/a.ts',
      'error types-files-must-not-import-runtime: src/domain/model.types.ts -> src/domain/model.ts',
    ].join('\n'),
    expectedDiagnostic: 'error no-circular: src/domain/a.ts -> src/domain/b.ts -> src/domain/a.ts',
    unexpectedDiagnostic: 'error types-files-must-not-import-runtime: src/domain/model.types.ts -> src/domain/model.ts',
  },
  {
    stepName: 'knip',
    output: ['Unused exports (1)', 'extensions/xread/index.ts:14 - unusedExport', 'Unused files (1)'].join('\n'),
    expectedDiagnostic: 'Unused exports (1)',
    unexpectedDiagnostic: 'extensions/xread/index.ts:14 - unusedExport',
  },
  {
    stepName: 'jscpd',
    output: [
      'Clone found (typescript):',
      ' - extensions/a.ts [10:2 - 20:5] (11 lines, 92 tokens)',
      ' - extensions/b.ts [15:2 - 25:5] (11 lines, 92 tokens)',
    ].join('\n'),
    expectedDiagnostic: 'Clone found (typescript):',
    unexpectedDiagnostic: ' - extensions/a.ts [10:2 - 20:5] (11 lines, 92 tokens)',
  },
  {
    stepName: 'eslint-length',
    output: [
      '/repo/src/too-long.ts',
      '1:121  error  This line has a length of 121. Maximum allowed is 120  max-len',
      '401:1  error  File has too many lines (401). Maximum allowed is 400  max-lines',
    ].join('\n'),
    expectedDiagnostic: [
      '/repo/src/too-long.ts',
      '1:121  error  This line has a length of 121. Maximum allowed is 120  max-len',
    ].join('\n'),
    unexpectedDiagnostic: '401:1  error  File has too many lines (401). Maximum allowed is 400  max-lines',
  },
];

interface MockExecaResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  all?: string;
}

const execaMock = mock(
  async (command: string, args: readonly string[], options: Record<string, unknown>): Promise<MockExecaResult> => {
    void command;
    void args;
    void options;
    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
      all: '',
    };
  }
);

mock.module('execa', () => ({ execa: execaMock }));

const { createDefaultVerifySteps, runVerify } = await import('../../src/verify/index.ts');
const DEFAULT_VERIFY_STEPS = createDefaultVerifySteps();

function okResult(): MockExecaResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    all: '',
  };
}

function failResult(output: string): MockExecaResult {
  return {
    exitCode: 17,
    stdout: '',
    stderr: '',
    all: output,
  };
}

describe('verify script', () => {
  it('runs all stages and succeeds when every stage exits with 0', async () => {
    execaMock.mockReset();
    execaMock.mockImplementation(async () => okResult());

    const result = await runVerify();

    expect(result).toEqual({ code: 0, stdout: 'verify: ok' });
    expect(execaMock.mock.calls.length).toBe(DEFAULT_VERIFY_STEPS.length);
    for (const [index, step] of DEFAULT_VERIFY_STEPS.entries()) {
      const call = execaMock.mock.calls[index];
      expect(call?.[0]).toBe(step.command);
      expect(call?.[1]).toEqual(step.args);
      const options = call?.[2] as Record<string, unknown> | undefined;
      expect(options?.reject).toBe(false);
      expect(options?.all).toBe(true);
      expect(options?.stdout).toBe('pipe');
      expect(options?.stderr).toBe('pipe');
    }
  });

  it('has fixtures for every verify stage in order', () => {
    expect(FAILURE_FIXTURES.map((fixture) => fixture.stepName)).toEqual(DEFAULT_VERIFY_STEPS.map((step) => step.name));
  });

  for (const fixture of FAILURE_FIXTURES) {
    it(`fails at "${fixture.stepName}" with only the first diagnostic in stderr`, async () => {
      execaMock.mockReset();
      const failureIndex = DEFAULT_VERIFY_STEPS.findIndex((step) => step.name === fixture.stepName);
      expect(failureIndex).toBeGreaterThanOrEqual(0);

      let callIndex = 0;
      execaMock.mockImplementation(async () => {
        const currentIndex = callIndex;
        callIndex += 1;
        if (currentIndex < failureIndex) {
          return okResult();
        }
        if (currentIndex === failureIndex) {
          return failResult(fixture.output);
        }
        return okResult();
      });

      const result = await runVerify();

      expect(result.code).toBe(17);
      expect(result.stdout).toBeUndefined();
      expect(result.stderr).toContain(`verify: failed at step "${fixture.stepName}"`);
      expect(result.stderr).toContain(fixture.expectedDiagnostic);
      expect(result.stderr).not.toContain(fixture.unexpectedDiagnostic);
      expect(execaMock.mock.calls.length).toBe(failureIndex + 1);
    });
  }

  it('in all mode runs all stages and aggregates full diagnostics for every failed stage', async () => {
    execaMock.mockReset();
    const firstFixture = FAILURE_FIXTURES[0];
    const secondFixture = FAILURE_FIXTURES[1];

    let callIndex = 0;
    execaMock.mockImplementation(async () => {
      const currentIndex = callIndex;
      callIndex += 1;
      if (currentIndex === 0) {
        return failResult(firstFixture.output);
      }
      if (currentIndex === 1) {
        return failResult(secondFixture.output);
      }
      return okResult();
    });

    const result = await runVerify(DEFAULT_VERIFY_STEPS, { errorMode: 'all' });

    expect(result.code).toBe(17);
    expect(result.stdout).toBeUndefined();
    expect(result.stderr).toContain(`verify: failed at step "${firstFixture.stepName}"`);
    expect(result.stderr).toContain(`verify: failed at step "${secondFixture.stepName}"`);
    expect(result.stderr).toContain(firstFixture.expectedDiagnostic);
    expect(result.stderr).toContain(firstFixture.unexpectedDiagnostic);
    expect(result.stderr).toContain(secondFixture.expectedDiagnostic);
    expect(result.stderr).toContain(secondFixture.unexpectedDiagnostic);
    expect(execaMock.mock.calls.length).toBe(DEFAULT_VERIFY_STEPS.length);
  });

  it('collects per-step timings and total duration when requested', async () => {
    execaMock.mockReset();
    execaMock.mockImplementation(async () => okResult());

    const result = await runVerify(DEFAULT_VERIFY_STEPS, { collectTimings: true });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe('verify: ok');
    expect(result.timings).toBeDefined();
    expect(result.timings?.steps.map((step) => step.name)).toEqual(DEFAULT_VERIFY_STEPS.map((step) => step.name));
    expect(result.timings?.steps.every((step) => step.code === 0)).toBe(true);
    expect(result.timings?.steps.every((step) => step.durationMs >= 0)).toBe(true);
    expect((result.timings?.totalMs ?? -1) >= 0).toBe(true);
  });

  it('throws on unknown error mode', async () => {
    // @ts-expect-error Covers runtime validation for callers outside TypeScript.
    await expect(runVerify([], { errorMode: 'unexpected-mode' })).rejects.toThrow('verify: unknown error mode "unexpected-mode"');
  });
});
