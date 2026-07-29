import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

const VERIFY_PATH = join(import.meta.dir, '..', 'bin', 'verify.ts');
const tempDirectories: string[] = [];

async function runVerify(cwd: string): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', [VERIFY_PATH], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        output: Buffer.concat(output).toString('utf8'),
      });
    });
  });
}

async function createProject(files: Record<string, string>, entry: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'quality-rules-project-'));
  tempDirectories.push(cwd);
  await writeFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'quality-rules-fixture',
        private: true,
        type: 'module',
        main: entry,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(
    join(cwd, 'agent-quality-gate.config.json'),
    `${JSON.stringify({ entries: [entry] }, null, 2)}\n`,
    'utf8'
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(cwd, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }
  return cwd;
}

function expectViolation(result: { exitCode: number; output: string }, rule: string): void {
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`quality(${rule})`);
}

function expectSuccess(result: { exitCode: number; output: string }): void {
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('verify: ok');
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('quality rules', () => {
  it('enforces console-format-placeholders', async () => {
    const invalidProject = await createProject(
      {
        'src/index.ts': 'export function logValue(value: string): void {\n  console.log(value);\n}\n',
      },
      'src/index.ts'
    );
    expectViolation(await runVerify(invalidProject), 'console-format-placeholders');

    const validProject = await createProject(
      {
        'src/index.ts': "export function logValue(value: string): void {\n  console.log('value: %s', value);\n}\n",
      },
      'src/index.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-empty-extended-interfaces', async () => {
    const invalidProject = await createProject(
      {
        'src/index.types.ts':
          'export interface Base {\n  readonly value: string;\n}\n\nexport interface Derived extends Base {}\n',
      },
      'src/index.types.ts'
    );
    expectViolation(await runVerify(invalidProject), 'no-empty-extended-interfaces');

    const validProject = await createProject(
      {
        'src/index.types.ts':
          'export interface Base {\n  readonly value: string;\n}\n\nexport interface Derived extends Base {\n  readonly active: boolean;\n}\n',
      },
      'src/index.types.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-null-undefined-parameter-union', async () => {
    const invalidProject = await createProject(
      {
        'src/index.ts':
          "export function normalize(value: string | null | undefined): string {\n  return value ?? 'fallback';\n}\n",
      },
      'src/index.ts'
    );
    expectViolation(await runVerify(invalidProject), 'no-null-undefined-parameter-union');

    const validProject = await createProject(
      {
        'src/index.ts': "export function normalize(value: string | null): string {\n  return value ?? 'fallback';\n}\n",
      },
      'src/index.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-runtime-in-types-files', async () => {
    const invalidProject = await createProject(
      {
        'src/index.types.ts': 'export const value = 1;\n',
      },
      'src/index.types.ts'
    );
    expectViolation(await runVerify(invalidProject), 'no-runtime-in-types-files');

    const validProject = await createProject(
      {
        'src/index.types.ts': 'export interface Shape {\n  readonly value: string;\n}\n',
      },
      'src/index.types.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-single-use-forwarders', async () => {
    const invalidProject = await createProject(
      {
        'src/index.ts':
          'function double(value: number): number {\n  return value * 2;\n}\n\nfunction forward(value: number): number {\n  return double(value);\n}\n\nexport function run(value: number): number {\n  return forward(value);\n}\n',
      },
      'src/index.ts'
    );
    expectViolation(await runVerify(invalidProject), 'no-single-use-forwarders');

    const validProject = await createProject(
      {
        'src/index.ts':
          'function double(value: number): number {\n  return value * 2;\n}\n\nfunction forward(value: number): number {\n  return double(value);\n}\n\nexport function runFirst(value: number): number {\n  return forward(value);\n}\n\nexport function runSecond(value: number): number {\n  return forward(value);\n}\n',
      },
      'src/index.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-types-in-runtime-files', async () => {
    const invalidProject = await createProject(
      {
        'src/index.ts':
          "export interface Shape {\n  readonly value: string;\n}\n\nexport const shape: Shape = { value: 'test' };\n",
      },
      'src/index.ts'
    );
    expectViolation(await runVerify(invalidProject), 'no-types-in-runtime-files');

    const validProject = await createProject(
      {
        'src/index.ts': 'export interface Shape {\n  readonly value: string;\n}\n',
      },
      'src/index.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-unknown-parameters', async () => {
    const invalidProject = await createProject(
      {
        'src/index.ts':
          "export function normalize(value: unknown): string {\n  return typeof value === 'string' ? value : 'fallback';\n}\n",
      },
      'src/index.ts'
    );
    expectViolation(await runVerify(invalidProject), 'no-unknown-parameters');

    const validProject = await createProject(
      {
        'src/index.ts': "export function normalize(value: string): string {\n  return value || 'fallback';\n}\n",
      },
      'src/index.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-useless-exported-type-aliases', async () => {
    const invalidProject = await createProject(
      {
        'src/index.types.ts':
          'interface InternalShape {\n  readonly value: string;\n}\n\nexport type PublicShape = InternalShape;\n',
      },
      'src/index.types.ts'
    );
    expectViolation(await runVerify(invalidProject), 'no-useless-exported-type-aliases');

    const validProject = await createProject(
      {
        'src/index.types.ts': 'export type PublicShape = {\n  readonly value: string;\n};\n',
      },
      'src/index.types.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-wide-parameter-unions', async () => {
    const invalidProject = await createProject(
      {
        'src/index.ts':
          'export function stringify(value: string | Date | RegExp): string {\n  return value.toString();\n}\n',
      },
      'src/index.ts'
    );
    expectViolation(await runVerify(invalidProject), 'no-wide-parameter-unions');

    const validProject = await createProject(
      {
        'src/index.ts': 'export function stringify(value: string | Date): string {\n  return value.toString();\n}\n',
      },
      'src/index.ts'
    );
    expectSuccess(await runVerify(validProject));
  });
});

describe('quality rule regressions', () => {
  it('treats side-effect imports as runtime statements', async () => {
    const cwd = await createProject(
      {
        'src/index.ts': "import './side-effect.js';\n\nexport interface Shape {\n  readonly value: string;\n}\n",
        'src/side-effect.ts': "console.log('loaded');\n",
      },
      'src/index.ts'
    );

    expectViolation(await runVerify(cwd), 'no-types-in-runtime-files');
  });

  it('keeps type-only imports type-only', async () => {
    const cwd = await createProject(
      {
        'src/base.types.ts': 'export interface Base {\n  readonly value: string;\n}\n',
        'src/index.ts':
          "import type { Base } from './base.types.js';\n\nexport interface Shape extends Base {\n  readonly active: boolean;\n}\n",
      },
      'src/index.ts'
    );

    expectSuccess(await runVerify(cwd));
  });

  it('accepts declaration files as type-only files', async () => {
    const cwd = await createProject(
      {
        'src/global.d.ts':
          'export interface Shape {\n  readonly value: string;\n}\n\nexport declare const shape: Shape;\n',
      },
      'src/global.d.ts'
    );

    expectSuccess(await runVerify(cwd));
  });

  it('accepts default-exported interfaces in type-only files', async () => {
    const cwd = await createProject(
      {
        'src/index.types.ts': 'export default interface Shape {\n  readonly value: string;\n}\n',
      },
      'src/index.types.ts'
    );

    expectSuccess(await runVerify(cwd));
  });

  it('accepts dynamic values passed through placeholders', async () => {
    const cwd = await createProject(
      {
        'src/index.ts':
          "export function logValue(value: string): void {\n  console.log('value: %s', `prefix-${value}`);\n}\n",
      },
      'src/index.ts'
    );

    expectSuccess(await runVerify(cwd));
  });

  it('checks computed console methods', async () => {
    const cwd = await createProject(
      {
        'src/index.ts': "export function logValue(value: string): void {\n  console['log'](value);\n}\n",
      },
      'src/index.ts'
    );

    expectViolation(await runVerify(cwd), 'console-format-placeholders');
  });
});
