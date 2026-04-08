import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { RunVerifyOptions, VerifyResult, VerifyStep } from '../../src/verify/index.js';

interface StageCase {
  step: VerifyStep;
  expectedExitCode: number;
  firstDiagnosticMarker: string;
  secondDiagnosticMarker: string;
}

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VERIFY_MODULE_PATH = fileURLToPath(new URL('../../src/verify/index.ts', import.meta.url));
const FIXTURES_ROOT = fileURLToPath(new URL('./fixtures/verify-e2e/', import.meta.url));

function fixturePath(...segments: string[]): string {
  return join(FIXTURES_ROOT, ...segments);
}

const STAGE_CASES: StageCase[] = [
  {
    step: {
      name: 'eslint',
      command: 'bun',
      args: [
        'x',
        'eslint',
        '--no-config-lookup',
        '--no-ignore',
        '--rule',
        'no-unused-vars:error',
        fixturePath('eslint', 'multiple-errors.js'),
      ],
    },
    expectedExitCode: 1,
    firstDiagnosticMarker: "'firstUnused' is assigned a value but never used",
    secondDiagnosticMarker: "'secondUnused' is assigned a value but never used",
  },
  {
    step: {
      name: 'remark',
      command: 'bun',
      args: ['x', 'remark', '--quiet', '--frail', fixturePath('remark', 'multiple-errors.md')],
    },
    expectedExitCode: 1,
    firstDiagnosticMarker: '5:1-5:20',
    secondDiagnosticMarker: '9:1-9:20',
  },
  {
    step: {
      name: 'tsc',
      command: 'bun',
      args: ['x', 'tsc', '-p', fixturePath('tsc', 'tsconfig.json')],
    },
    expectedExitCode: 2,
    firstDiagnosticMarker: "Type 'string' is not assignable to type 'number'.",
    secondDiagnosticMarker: "Type 'number' is not assignable to type 'boolean'.",
  },
  {
    step: {
      name: 'knip',
      command: 'bun',
      args: ['x', 'knip', '--directory', fixturePath('knip'), '--config', 'knip.json', '--include', 'exports'],
    },
    expectedExitCode: 1,
    firstDiagnosticMarker: 'unusedAlpha',
    secondDiagnosticMarker: 'unusedBeta',
  },
  {
    step: {
      name: 'jscpd',
      command: 'bun',
      args: ['x', 'jscpd', '--config', fixturePath('jscpd', '.jscpd.json'), fixturePath('jscpd')],
    },
    expectedExitCode: 1,
    firstDiagnosticMarker: 'Clone found (typescript):',
    secondDiagnosticMarker: 'group-one-a.ts',
  },
];

const RUN_VERIFY_CHILD_SOURCE = [
  `import { runVerify } from ${JSON.stringify(VERIFY_MODULE_PATH)};`,
  'const steps = JSON.parse(process.env.VERIFY_E2E_STEPS_JSON ?? "[]");',
  'const options = JSON.parse(process.env.VERIFY_E2E_OPTIONS_JSON ?? "{}");',
  'const result = await runVerify(steps, options);',
  'process.stdout.write(JSON.stringify(result));',
].join('\n');

interface CommandResult {
  code: number;
  output: string;
  stderr: string;
  stdout: string;
}

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const output = [stdout, stderr].filter(Boolean).join('\n');
  return {
    code: result.status ?? 1,
    output,
    stderr,
    stdout,
  };
}

function runVerifyInChild(steps: VerifyStep[], options: RunVerifyOptions = {}): VerifyResult {
  const result = spawnSync(process.execPath, ['--eval', RUN_VERIFY_CHILD_SOURCE], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      VERIFY_E2E_STEPS_JSON: JSON.stringify(steps),
      VERIFY_E2E_OPTIONS_JSON: JSON.stringify(options),
    },
  });

  if ((result.status ?? 1) !== 0) {
    const message = [
      `verify child process failed with status ${result.status ?? 'null'}`,
      `stdout:\n${result.stdout ?? ''}`,
      `stderr:\n${result.stderr ?? ''}`,
    ].join('\n');
    throw new Error(message);
  }

  const payload = result.stdout ?? '';
  if (!payload.trim()) {
    throw new Error('verify child process returned empty stdout');
  }
  return JSON.parse(payload) as VerifyResult;
}

describe('verify e2e with fixture files', () => {
  it('returns ok for a clean stage', () => {
    const cleanStep: VerifyStep = {
      name: 'eslint',
      command: 'bun',
      args: [
        'x',
        'eslint',
        '--no-config-lookup',
        '--no-ignore',
        '--rule',
        'no-unused-vars:error',
        fixturePath('eslint', 'no-errors.js'),
      ],
    };
    const result = runVerifyInChild([cleanStep]);
    expect(result).toEqual({ code: 0, stdout: 'verify: ok' });
  });

  for (const stageCase of STAGE_CASES) {
    it(`for "${stageCase.step.name}" raw tool output has 2+ diagnostics, but verify returns only the first one`, () => {
      const raw = runCommand(stageCase.step.command, stageCase.step.args);
      expect(raw.code).toBe(stageCase.expectedExitCode);
      expect(raw.output).toContain(stageCase.firstDiagnosticMarker);
      expect(raw.output).toContain(stageCase.secondDiagnosticMarker);

      const verifyResult = runVerifyInChild([stageCase.step]);
      expect(verifyResult.code).toBe(stageCase.expectedExitCode);
      expect(verifyResult.stdout).toBeUndefined();
      expect(verifyResult.stderr).toContain(`verify: failed at step "${stageCase.step.name}"`);
      expect(verifyResult.stderr).toContain(stageCase.firstDiagnosticMarker);
      expect(verifyResult.stderr).not.toContain(stageCase.secondDiagnosticMarker);
    });
  }

  for (const stageCase of STAGE_CASES) {
    it(`for "${stageCase.step.name}" in all-errors mode returns all diagnostics from the failed stage`, () => {
      const verifyResult = runVerifyInChild([stageCase.step], { errorMode: 'all' });

      expect(verifyResult.code).toBe(stageCase.expectedExitCode);
      expect(verifyResult.stdout).toBeUndefined();
      expect(verifyResult.stderr).toContain(`verify: failed at step "${stageCase.step.name}"`);
      expect(verifyResult.stderr).toContain(stageCase.firstDiagnosticMarker);
      expect(verifyResult.stderr).toContain(stageCase.secondDiagnosticMarker);
    });
  }

  it('stops at the first failed stage when multiple stages fail', () => {
    const first = STAGE_CASES[0] as StageCase;
    const second = STAGE_CASES[1] as StageCase;
    const result = runVerifyInChild([first.step, second.step]);

    expect(result.code).toBe(first.expectedExitCode);
    expect(result.stderr).toContain(`verify: failed at step "${first.step.name}"`);
    expect(result.stderr).toContain(first.firstDiagnosticMarker);
    expect(result.stderr).not.toContain(`verify: failed at step "${second.step.name}"`);
    expect(result.stderr).not.toContain(second.firstDiagnosticMarker);
  });

  it('in all-errors mode keeps running and reports failures from all failed stages', () => {
    const first = STAGE_CASES[0] as StageCase;
    const second = STAGE_CASES[1] as StageCase;
    const result = runVerifyInChild([first.step, second.step], { errorMode: 'all' });

    expect(result.code).toBe(first.expectedExitCode);
    expect(result.stderr).toContain(`verify: failed at step "${first.step.name}"`);
    expect(result.stderr).toContain(first.firstDiagnosticMarker);
    expect(result.stderr).toContain(first.secondDiagnosticMarker);
    expect(result.stderr).toContain(`verify: failed at step "${second.step.name}"`);
    expect(result.stderr).toContain(second.firstDiagnosticMarker);
    expect(result.stderr).toContain(second.secondDiagnosticMarker);
  });
});
