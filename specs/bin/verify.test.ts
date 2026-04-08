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
    stepName: 'ast-grep',
    output: [
      'src/runtime.ts:11:3 error[no-record-string-unknown] Avoid Record<string, unknown>.',
      'src/runtime.ts:22:5 error[no-useless-exported-type-alias] Export original type directly.',
    ].join('\n'),
    expectedDiagnostic: 'src/runtime.ts:11:3 error[no-record-string-unknown] Avoid Record<string, unknown>.',
    unexpectedDiagnostic: 'src/runtime.ts:22:5 error[no-useless-exported-type-alias] Export original type directly.',
  },
  {
    stepName: 'remark',
    output: [
      '\u001B[4m\u001B[33mdocs/usage.md\u001B[39m\u001B[24m',
      '4:1-4:5  \u001B[33mwarning\u001B[39m  Unexpected duplicate heading',
      '8:1-8:5  warning  Another markdown warning',
    ].join('\n'),
    expectedDiagnostic: ['docs/usage.md', '4:1-4:5  warning  Unexpected duplicate heading'].join('\n'),
    unexpectedDiagnostic: '8:1-8:5  warning  Another markdown warning',
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

const { VERIFY_STEPS, runVerify } = await import('../../src/verify/index.ts');

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
    expect(execaMock.mock.calls.length).toBe(VERIFY_STEPS.length);
    for (const [index, step] of VERIFY_STEPS.entries()) {
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
    expect(FAILURE_FIXTURES.map((fixture) => fixture.stepName)).toEqual(VERIFY_STEPS.map((step) => step.name));
  });

  for (const fixture of FAILURE_FIXTURES) {
    it(`fails at "${fixture.stepName}" with only the first diagnostic in stderr`, async () => {
      execaMock.mockReset();
      const failureIndex = VERIFY_STEPS.findIndex((step) => step.name === fixture.stepName);
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
    const firstFixture = FAILURE_FIXTURES[0] as FailureFixture;
    const secondFixture = FAILURE_FIXTURES[1] as FailureFixture;

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

    const result = await runVerify(VERIFY_STEPS, { errorMode: 'all' });

    expect(result.code).toBe(17);
    expect(result.stdout).toBeUndefined();
    expect(result.stderr).toContain(`verify: failed at step "${firstFixture.stepName}"`);
    expect(result.stderr).toContain(`verify: failed at step "${secondFixture.stepName}"`);
    expect(result.stderr).toContain(firstFixture.expectedDiagnostic);
    expect(result.stderr).toContain(firstFixture.unexpectedDiagnostic);
    expect(result.stderr).toContain(secondFixture.expectedDiagnostic);
    expect(result.stderr).toContain(secondFixture.unexpectedDiagnostic);
    expect(execaMock.mock.calls.length).toBe(VERIFY_STEPS.length);
  });

  it('throws on unknown error mode', async () => {
    await expect(runVerify([], { errorMode: 'unexpected-mode' as unknown as 'first' | 'all' })).rejects.toThrow(
      'verify: unknown error mode "unexpected-mode"'
    );
  });
});
