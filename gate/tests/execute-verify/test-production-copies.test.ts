import { cp, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { checkTestProductionCopies } from '../../execute-verify/test-production-copies.ts';
import { runNodeProcess } from '../../../process/run-node-tool/run-node-tool.ts';
import { executeVerify } from '../../execute-verify/execute-verify.ts';
import { useExecuteVerifyProjects } from '../../../tests/support/execute-verify-fixture.ts';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.ts';
import { formatVerifyResultDiagnostics } from '../../quality-gate-run/format-diagnostics.ts';

useIsolatedAgentQualityGateHome();
const { makeTempDirectory } = useExecuteVerifyProjects();
const fixtureRoot = join(import.meta.dir, '../../.quality-fixtures/test-production-copies');
const configPath = join(import.meta.dir, '../../../assets/.fallowrc.json');

async function project(): Promise<string> {
  const root = await makeTempDirectory('test-production-copies-');
  await cp(fixtureRoot, root, { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'copy-probe', type: 'module', private: true }),
  );
  return root;
}

test('actual Fallow finds cross production/test clones', async () => {
  const root = await project();
  const result = await checkTestProductionCopies(runNodeProcess, root, configPath);
  expect(result.exitCode).toBe(1);
  const text = formatVerifyResultDiagnostics(result);
  expect(text).toContain('test-production-copy');
  expect(text).toContain('tests/price.test.ts');
  expect(text).toContain('src/price.ts');
});

test('test-to-test duplication alone does not fail this check', async () => {
  const root = await project();
  await rename(join(root, 'src/price.ts'), join(root, 'tests/second.test.ts'));
  const result = await checkTestProductionCopies(runNodeProcess, root, configPath);
  expect(result.exitCode).toBe(0);
  expect(result.diagnostics).toEqual([]);
});

test('production-only duplication is left to existing hygiene', async () => {
  const root = await project();
  await rename(join(root, 'tests/price.test.ts'), join(root, 'src/second.ts'));
  await writeFile(join(root, 'tests/empty.test.ts'), 'console.log(17);');
  const result = await checkTestProductionCopies(runNodeProcess, root, configPath);
  expect(result.exitCode).toBe(0);
});

test('malformed analyzer output is an infrastructure failure, not a pass', async () => {
  const root = await project();
  let message = '';
  try {
    await checkTestProductionCopies(
      async (options) => {
        const path = options.args[options.args.indexOf('--output-file') + 1];
        if (path === undefined) throw new Error('Missing output-file');
        await writeFile(path, '{}');
        return { exitCode: 0, stdout: '{}', stderr: '' };
      },
      root,
      configPath,
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    message = error.message;
  }
  expect(message).toContain('invalid JSON');
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
