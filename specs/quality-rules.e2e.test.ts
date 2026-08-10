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
  const packageJson = { name: 'quality-rules-fixture', private: true, type: 'module', main: entry };
  await writeFile(join(cwd, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  const tsconfig = {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['src/**/*.ts'],
  };
  await writeFile(join(cwd, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`, 'utf8');
  await writeFile(join(cwd, 'agent-quality-gate.config.json'), `${JSON.stringify({ entries: [entry] }, null, 2)}\n`, 'utf8');
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
        'src/index.types.ts':
          "export const values = ['a', 'b'] as const;\n\nexport type Value = (typeof values)[number];\n\nexport interface Shape {\n  readonly value: Value;\n}\n",
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

describe('locked catalog type derivation rules', () => {
  it('allows element types derived from runtime values', async () => {
    const cwd = await createProject(
      {
        'src/index.types.ts': "declare const values: readonly ['a', 'b'];\n\nexport type Value = (typeof values)[number];\n",
      },
      'src/index.types.ts'
    );

    expectSuccess(await runVerify(cwd));
  });

  it('accepts the runtime tuple and derived type through the full quality gate', async () => {
    const cwd = await createProject(
      {
        'src/values.ts': "export const values = ['a', 'b'] as const;\n",
        'src/values.types.ts': "import type { values } from './values.js';\n\nexport type Value = (typeof values)[number];\n",
      },
      'src/values.types.ts'
    );

    expectSuccess(await runVerify(cwd));
  });

  it('rejects every other indexed access type with a stable diagnostic', async () => {
    const cwd = await createProject(
      {
        'src/index.types.ts':
          "type Order = { customer: string };\ntype SomeType = { value: string };\ntype Tuple = readonly [string];\ntype Map = Record<string, string>;\ndeclare const value: { field: string };\n\nexport type A = Order['customer'];\nexport type B = SomeType[keyof SomeType];\nexport type C = Tuple[0];\nexport type D = Map[string];\nexport type E = (typeof value)['field'];\n",
      },
      'src/index.types.ts'
    );

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.output.match(/quality\(no-indexed-access-types\)/gu)).toHaveLength(5);
    expect(result.output).toContain('Indexed access types are forbidden except for (typeof identifier)[number].');
  });

  it('rejects manually authored string literal unions', async () => {
    const cwd = await createProject(
      {
        'src/index.types.ts': "export type Value = 'a' | 'b';\n",
      },
      'src/index.types.ts'
    );

    expectViolation(await runVerify(cwd), 'no-manual-exported-string-literal-unions');
  });

  it('requires exported string literal catalogs to be unannotated as const tuples', async () => {
    const cwd = await createProject(
      {
        'src/index.ts':
          "import type { Value } from './value.types.js';\n\nexport const bare = ['a', 'b'];\nexport const arrayAnnotated: Value[] = ['a', 'b'];\nexport const genericArray: Array<Value> = ['a', 'b'];\nexport const readonlyArray: readonly Value[] = ['a', 'b'];\nexport const genericReadonly: ReadonlyArray<Value> = ['a', 'b'];\nexport const asserted = ['a', 'b'] as Value[];\nexport const satisfied = ['a', 'b'] satisfies Value[];\nexport const assertedAndSatisfied = ['a', 'b'] as const satisfies readonly Value[];\n",
        'src/value.types.ts':
          "declare const allowedValues: readonly ['a', 'b'];\n\nexport type Value = (typeof allowedValues)[number];\n",
      },
      'src/index.ts'
    );

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.output.match(/quality\(require-export-string-literal-catalogs-as-const\)/gu)).toHaveLength(8);
    expect(result.output).toContain(
      'Export string literal catalogs as an unannotated readonly tuple using "as const", then derive the union with "(typeof values)[number]".'
    );
  });

  it('treats static template literals as string catalog elements', async () => {
    const invalidProject = await createProject(
      {
        'src/index.ts': 'export const values = [`a`, `b`];\n',
      },
      'src/index.ts'
    );
    expectViolation(await runVerify(invalidProject), 'require-export-string-literal-catalogs-as-const');

    const validProject = await createProject(
      {
        'src/index.ts':
          'const suffix = "b";\n\nexport const values = [`a`, `b`] as const;\nexport type Value = (typeof values)[number];\nexport const dynamicValues = [`a${suffix}`, `b`];\n',
      },
      'src/index.ts'
    );
    expectSuccess(await runVerify(validProject));
  });

  it('allows a companion type beside its runtime catalog and does not affect non-catalog arrays', async () => {
    const cwd = await createProject(
      {
        'src/index.ts':
          "const localValues = ['a', 'b'];\nconst defaultValue = 'b';\nfunction loadValues(): string[] {\n  return ['a'];\n}\n\nexport const values = ['a', 'b'] as const;\nexport type Value = (typeof values)[number];\nexport const emptyValues: string[] = [];\nexport const computedValues: string[] = loadValues();\nexport const mixedValues = ['a', defaultValue];\nexport const numericValues = [1, 2];\nexport function firstLocalValue(): string {\n  return localValues[0] ?? '';\n}\n",
      },
      'src/index.ts'
    );

    expectSuccess(await runVerify(cwd));
  });

  it('rejects all other runtime types, including imported and non-exported companions', async () => {
    const cwd = await createProject(
      {
        'src/imported-values.ts': "export const importedValues = ['a', 'b'] as const;\n",
        'src/shared.types.ts': "export type ExistingType = string;\nexport type ImportedType = { item: string };\nexport interface A { a: string }\nexport interface B { b: string }\n",
        'src/index.ts':
          "import { importedValues } from './imported-values.js';\nimport type { A, B, ExistingType, ImportedType } from './shared.types.js';\n\nconst defaultValue = 'b';\nexport const values = ['a', 'b'] as const;\nconst localValues = ['a', 'b'] as const;\nexport const emptyValues = [] as const;\nexport const mixedValues = ['a', defaultValue] as const;\nexport const numericValues = [1, 2] as const;\nexport const mutableValues = ['a', 'b'];\ntype Local = ExistingType;\nexport type ImportedItem = ImportedType['item'];\nexport type ImportedValues = (typeof importedValues)[number];\nexport interface RuntimeInterface { value: string }\nexport type Combined = A & B;\nexport type Values = typeof values;\nexport type First = (typeof values)[0];\ntype UnexportedCompanion = (typeof values)[number];\nexport type LocalCompanion = (typeof localValues)[number];\nexport type EmptyValue = (typeof emptyValues)[number];\nexport type MixedValue = (typeof mixedValues)[number];\nexport type NumericValue = (typeof numericValues)[number];\nexport type MutableValue = (typeof mutableValues)[number];\n",
      },
      'src/index.ts'
    );

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.output.match(/quality\(no-types-in-runtime-files\)/gu)).toHaveLength(13);
  });

  it('ignores user configuration that disables the locked rules', async () => {
    const cwd = await createProject(
      {
        'src/values.ts': "export const values = ['a', 'b'];\nexport type Values = typeof values;\n",
        'src/values.types.ts':
          "import type { values } from './values.js';\n\nexport type Invalid = (typeof values)['field'];\nexport type Manual = 'a' | 'b';\n",
      },
      'src/values.types.ts'
    );
    await writeFile(
      join(cwd, '.oxlintrc.json'),
      `${JSON.stringify({ rules: { 'quality/no-indexed-access-types': 'off', 'quality/no-manual-exported-string-literal-unions': 'off', 'quality/no-types-in-runtime-files': 'off', 'quality/require-export-string-literal-catalogs-as-const': 'off' } }, null, 2)}\n`,
      'utf8'
    );

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('quality(no-indexed-access-types)');
    expect(result.output).toContain('quality(no-manual-exported-string-literal-unions)');
    expect(result.output).toContain('quality(no-types-in-runtime-files)');
    expect(result.output).toContain('quality(require-export-string-literal-catalogs-as-const)');
  });
});
