import { afterEach, describe, expect, it } from 'bun:test';

import { executeVerify } from '../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';
import { createProject, removeCreatedProjects } from './quality-rules-project.js';
import type { QualityRulesProject } from './quality-rules-project.types.js';

useIsolatedAgentQualityGateHome();

async function runVerify(
  project: QualityRulesProject,
): Promise<{ exitCode: number; output: string }> {
  const result = await executeVerify({
    projectRoot: project.cwd,
    entries: [project.entry],
  });
  return {
    exitCode: result.exitCode,
    output: `${result.stdout}${result.stderr}`,
  };
}

function expectViolation(result: { exitCode: number; output: string }, rule: string): void {
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`aqg(${rule})`);
}

function expectSuccess(result: { exitCode: number; output: string }): void {
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('verify: ok');
}

afterEach(async () => {
  await removeCreatedProjects();
});

describe('quality rules', () => {
  it('enforces console-format-placeholders', async () => {
    const invalidProject = await createProject(
      'console-format-placeholders/invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(invalidProject), 'console-format-placeholders');

    const validProject = await createProject('console-format-placeholders/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-empty-extended-interfaces', async () => {
    const invalidProject = await createProject(
      'no-empty-extended-interfaces/invalid',
      'src/index.types.ts',
    );
    expectViolation(await runVerify(invalidProject), 'no-empty-extended-interfaces');

    const validProject = await createProject(
      'no-empty-extended-interfaces/valid',
      'src/index.types.ts',
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-null-undefined-parameter-union', async () => {
    const invalidProject = await createProject(
      'no-null-undefined-parameter-union/invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(invalidProject), 'no-null-undefined-parameter-union');

    const validProject = await createProject(
      'no-null-undefined-parameter-union/valid',
      'src/index.ts',
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-runtime-in-types-files', async () => {
    const invalidProject = await createProject(
      'no-runtime-in-types-files/invalid',
      'src/index.types.ts',
    );
    expectViolation(await runVerify(invalidProject), 'no-runtime-in-types-files');

    const validProject = await createProject(
      'no-runtime-in-types-files/valid',
      'src/index.types.ts',
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-identity-aliases', async () => {
    const invalidProject = await createProject('no-identity-aliases/invalid', 'src/index.ts');
    expectViolation(await runVerify(invalidProject), 'no-identity-aliases');

    const constInvalidProject = await createProject(
      'no-identity-aliases/const-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(constInvalidProject), 'no-identity-aliases');

    const validProject = await createProject('no-identity-aliases/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-thin-forwarders', async () => {
    const invalidProject = await createProject('no-thin-forwarders/invalid', 'src/index.ts');
    expectViolation(await runVerify(invalidProject), 'no-thin-forwarders');

    const multiUseInvalidProject = await createProject(
      'no-thin-forwarders/multi-use-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(multiUseInvalidProject), 'no-thin-forwarders');

    const restInvalidProject = await createProject(
      'no-thin-forwarders/rest-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(restInvalidProject), 'no-thin-forwarders');

    const variableInvalidProject = await createProject(
      'no-thin-forwarders/variable-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(variableInvalidProject), 'no-thin-forwarders');

    const objectInvalidProject = await createProject(
      'no-thin-forwarders/object-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(objectInvalidProject), 'no-thin-forwarders');

    const validProject = await createProject('no-thin-forwarders/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-trivial-const-wrappers', async () => {
    const invalidProject = await createProject('no-trivial-const-wrappers/invalid', 'src/index.ts');
    expectViolation(await runVerify(invalidProject), 'no-trivial-const-wrappers');

    const identifierInvalidProject = await createProject(
      'no-trivial-const-wrappers/identifier-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(identifierInvalidProject), 'no-trivial-const-wrappers');

    const objectInvalidProject = await createProject(
      'no-trivial-const-wrappers/object-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(objectInvalidProject), 'no-trivial-const-wrappers');

    const localInvalidProject = await createProject(
      'no-trivial-const-wrappers/local-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(localInvalidProject), 'no-trivial-const-wrappers');

    const castIncludesInvalidProject = await createProject(
      'no-trivial-const-wrappers/cast-includes-invalid',
      'src/index.ts',
    );
    expectViolation(await runVerify(castIncludesInvalidProject), 'no-trivial-const-wrappers');

    const validProject = await createProject('no-trivial-const-wrappers/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-types-in-runtime-files', async () => {
    const invalidProject = await createProject('no-types-in-runtime-files/invalid', 'src/index.ts');
    expectViolation(await runVerify(invalidProject), 'no-types-in-runtime-files');

    const validProject = await createProject('no-types-in-runtime-files/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-unknown-parameters', async () => {
    const invalidProject = await createProject('no-unknown-parameters/invalid', 'src/index.ts');
    expectViolation(await runVerify(invalidProject), 'no-unknown-parameters');

    const validProject = await createProject('no-unknown-parameters/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-useless-exported-type-aliases', async () => {
    const invalidProject = await createProject(
      'no-useless-exported-type-aliases/invalid',
      'src/index.types.ts',
    );
    expectViolation(await runVerify(invalidProject), 'no-useless-exported-type-aliases');

    const validProject = await createProject(
      'no-useless-exported-type-aliases/valid',
      'src/index.types.ts',
    );
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-wide-parameter-unions', async () => {
    const invalidProject = await createProject('no-wide-parameter-unions/invalid', 'src/index.ts');
    expectViolation(await runVerify(invalidProject), 'no-wide-parameter-unions');

    const validProject = await createProject('no-wide-parameter-unions/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces promise-function-async', async () => {
    const invalidProject = await createProject('promise-function-async/invalid', 'src/index.ts');
    const invalid = await runVerify(invalidProject);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.output).toContain('typescript(promise-function-async)');

    const validProject = await createProject('promise-function-async/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces consistent-type-imports disallowTypeAnnotations', async () => {
    const invalidProject = await createProject('consistent-type-imports/invalid', 'src/index.ts');
    const invalid = await runVerify(invalidProject);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.output).toContain('typescript(consistent-type-imports)');

    const validProject = await createProject('consistent-type-imports/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('enforces no-inline-multiline-test-data', async () => {
    const repair =
      'Do not embed multi-line test data. Store it in a fixture file and load it in the test.';

    for (const [fixture, entry] of [
      ['no-inline-multiline-test-data/invalid/literal', 'tests/example.test.ts'],
      ['no-inline-multiline-test-data/invalid/interpolated-template', 'tests/example.test.ts'],
      ['no-inline-multiline-test-data/invalid/static-template', 'tests/example.test.ts'],
      ['no-inline-multiline-test-data/invalid/newline-join', 'tests/example.test.ts'],
      ['no-inline-multiline-test-data/invalid/static-concatenation', 'tests/example.test.ts'],
      ['no-inline-multiline-test-data/invalid/suffix-name', 'src/example.test.ts'],
      ['no-inline-multiline-test-data/invalid/test-directory', 'tests/example.ts'],
      ['no-inline-multiline-test-data/invalid/prose-multiline', 'tests/example.test.ts'],
      ['no-inline-multiline-test-data/invalid/sql-multiline', 'tests/example.test.ts'],
      ['no-inline-multiline-test-data/invalid/arbitrary-multiline', 'tests/example.test.ts'],
    ] as const) {
      const result = await runVerify(await createProject(fixture, entry));
      expectViolation(result, 'no-inline-multiline-test-data');
      expect(result.output).toContain(repair);
    }

    for (const [fixture, entry] of [
      ['no-inline-multiline-test-data/valid/one-line-data', 'tests/example.test.ts'],
      ['no-inline-multiline-test-data/valid/non-test-file', 'src/index.ts'],
    ] as const) {
      expectSuccess(await runVerify(await createProject(fixture, entry)));
    }
  });
});

describe('quality rule regressions', () => {
  it('treats side-effect imports as runtime statements', async () => {
    const cwd = await createProject('side-effect-imports-as-runtime', 'src/index.ts');

    expectViolation(await runVerify(cwd), 'no-types-in-runtime-files');
  });

  it('keeps type-only imports type-only', async () => {
    const cwd = await createProject('type-only-imports', 'src/index.ts');

    expectSuccess(await runVerify(cwd));
  });

  it('accepts declaration files as type-only files', async () => {
    const cwd = await createProject('declaration-files', 'src/global.d.ts');

    expectSuccess(await runVerify(cwd));
  });

  it('accepts default-exported interfaces in type-only files', async () => {
    const cwd = await createProject('default-exported-interfaces', 'src/index.types.ts');

    expectSuccess(await runVerify(cwd));
  });

  it('accepts dynamic values passed through placeholders', async () => {
    const cwd = await createProject('dynamic-values-through-placeholders', 'src/index.ts');

    expectSuccess(await runVerify(cwd));
  });

  it('checks computed console methods', async () => {
    const cwd = await createProject('computed-console-methods', 'src/index.ts');

    expectViolation(await runVerify(cwd), 'console-format-placeholders');
  });
});

describe('locked catalog type derivation rules', () => {
  it('allows element types derived from runtime values', async () => {
    const cwd = await createProject('element-types-from-runtime-values', 'src/index.types.ts');

    expectSuccess(await runVerify(cwd));
  });

  it('accepts the runtime tuple and derived type through the full quality gate', async () => {
    const cwd = await createProject('runtime-tuple-and-derived-type', 'src/values.types.ts');

    expectSuccess(await runVerify(cwd));
  });

  it('rejects every other indexed access type with a stable diagnostic', async () => {
    const cwd = await createProject('indexed-access-types-rejected', 'src/index.types.ts');
    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.output.match(/aqg\(no-indexed-access-types\)/gu)).toHaveLength(5);
    expect(result.output).toContain(
      'Indexed access types are forbidden except for (typeof identifier)[number].',
    );
  });

  it('rejects manually authored string literal unions', async () => {
    const cwd = await createProject('manual-string-literal-unions', 'src/index.types.ts');

    expectViolation(await runVerify(cwd), 'no-manual-exported-string-literal-unions');
  });

  it('requires exported string literal catalogs to be unannotated as const tuples', async () => {
    const cwd = await createProject('require-export-string-literal-catalogs', 'src/index.ts');
    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    expect(
      result.output.match(/aqg\(require-export-string-literal-catalogs-as-const\)/gu),
    ).toHaveLength(8);
    expect(result.output).toContain(
      'Export string literal catalogs as an unannotated readonly tuple using "as const", then derive the union with "(typeof values)[number]". For membership against a string, use .some((value) => value === candidate) or a Set derived from the catalog - not .includes(candidate).',
    );
  });

  it('treats static template literals as string catalog elements', async () => {
    const invalidProject = await createProject('static-template-literals/invalid', 'src/index.ts');
    expectViolation(
      await runVerify(invalidProject),
      'require-export-string-literal-catalogs-as-const',
    );

    const validProject = await createProject('static-template-literals/valid', 'src/index.ts');
    expectSuccess(await runVerify(validProject));
  });

  it('allows a companion type beside its runtime catalog and does not affect non-catalog arrays', async () => {
    const cwd = await createProject('companion-type-beside-catalog', 'src/index.ts');

    expectSuccess(await runVerify(cwd));
  });

  it('rejects all other runtime types, including imported and non-exported companions', async () => {
    const cwd = await createProject('other-runtime-types-rejected', 'src/index.ts');
    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.output.match(/aqg\(no-types-in-runtime-files\)/gu)).toHaveLength(13);
  });
});
