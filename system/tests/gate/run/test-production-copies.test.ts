import { cp, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import type { CombinedDupesSection } from '#system/gate/run/fallow/json-schemas.ts';
import type { CheckResult } from '#system/gate/run/check-result.ts';
import type { ToolRunResult } from '#system/gate/run/execute-verify.ts';
import { checkTestProductionCopies } from '#system/gate/run/test-production-copies.ts';
import { executeVerify } from '#system/gate/run/execute-verify.ts';
import { useExecuteVerifyProjects } from '#system/tests/support/execute-verify-fixture.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import { formatVerifyResultDiagnostics } from '#system/gate/quality-gate-run/format-diagnostics.ts';

useIsolatedAgentQualityGateHome();
const { makeTempDirectory } = useExecuteVerifyProjects();
const fixtureRoot = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures/test-production-copies',
);

async function project(): Promise<string> {
  const root = await makeTempDirectory('test-production-copies-');
  await cp(fixtureRoot, root, { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'copy-probe', type: 'module', private: true }),
  );
  return root;
}

function expectNoDiagnostics(result: CheckResult): void {
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toEqual([]);
}

function instance(file: string, start_line: number, end_line: number) {
  return { file, start_line, end_line };
}

function run(
  ...groups: Array<Array<{ file: string; start_line: number; end_line: number }>>
): ToolRunResult {
  const dupes: CombinedDupesSection = {
    clone_groups: groups.map((instances) => ({ instances })),
  };
  return {
    exitCode: 0,
    stdout: JSON.stringify({ kind: 'combined', dupes }),
    stderr: '',
  };
}

test('production/test clones fail this check', async () => {
  const root = await project();
  const result = await checkTestProductionCopies(
    root,
    run([instance('src/price.ts', 1, 10), instance('tests/price.test.ts', 3, 12)]),
  );
  expect(result.exitCode).toBe(1);
  const text = formatVerifyResultDiagnostics(result);
  expect(text).toContain('test-production-copy');
  expect(text).toContain('tests/price.test.ts');
  expect(text).toContain('src/price.ts');
});

test('test-to-test duplication alone does not fail this check', async () => {
  const root = await project();
  const result = await checkTestProductionCopies(
    root,
    run([
      { file: 'tests/price.test.ts', start_line: 1, end_line: 10 },
      { file: 'tests/second.test.ts', start_line: 2, end_line: 11 },
    ]),
  );
  expectNoDiagnostics(result);
});

test('production-only duplication is left to existing hygiene', async () => {
  const root = await project();
  await rename(join(root, 'tests/price.test.ts'), join(root, 'src/second.ts'));
  await writeFile(join(root, 'tests/empty.test.ts'), 'console.log(17);\n');
  const result = await checkTestProductionCopies(
    root,
    run([
      { file: 'src/price.ts', start_line: 1, end_line: 10 },
      { file: 'src/second.ts', start_line: 4, end_line: 13 },
    ]),
  );
  expect(result.exitCode).toBe(0);
});

test('projects without test files skip this check', async () => {
  const root = await project();
  await rename(join(root, 'tests/price.test.ts'), join(root, 'tests/data.ts'));
  await rename(join(root, 'tests'), join(root, 'helpers'));
  const result = await checkTestProductionCopies(
    root,
    run([instance('src/price.ts', 1, 10), instance('tests/helper.ts', 3, 12)]),
  );
  expectNoDiagnostics(result);
});

test('malformed analyzer output is an infrastructure failure, not a pass', async () => {
  const root = await project();
  let message = '';
  try {
    await checkTestProductionCopies(root, { exitCode: 0, stdout: '{}', stderr: '' });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    message = error.message;
  }
  expect(message).toContain('invalid dupes section');
});

test('verify exposes the copy diagnostic without changing production dead-code policy', async () => {
  const root = await project();
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ESNext',
        module: 'Preserve',
        moduleResolution: 'Bundler',
        noEmit: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  const result = await executeVerify({ projectRoot: root, entries: ['src/price.ts'] });
  expect(result.exitCode).toBe(1);
  expect(formatVerifyResultDiagnostics(result)).toContain('test-production-copy');
});
