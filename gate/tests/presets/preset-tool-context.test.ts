import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { sleep } from 'bun';
import * as v from 'valibot';
import { homeInstalledPresetRoot } from '../../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { executeVerify } from '../../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import { useExecuteVerifyProjects } from '../../../tests/support/execute-verify-fixture.js';
import { emptyToolResult } from '../execute-verify/verify-phases-helpers.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject } = useExecuteVerifyProjects();

async function install(name: string) {
  const root = homeInstalledPresetRoot(name);
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify({
      name,
      requires: [],
      files: [],
      dependencies: [],
      oxlint: { nativePlugins: [], plugins: [], rules: {}, overrides: [] },
    }),
  );
  await copyFile(
    join(import.meta.dir, '../../.quality-fixtures/preset-tool-context/check.ts'),
    join(root, 'check.ts'),
  );
}

const ContextSchema = v.pipe(
  v.string(),
  v.parseJson(),
  v.object({
    projectRoot: v.string(),
    entries: v.array(v.string()),
    ignorePatterns: v.array(v.string()),
    config: v.object({ entry: v.array(v.string()), ignoreDependencies: v.array(v.string()) }),
    managedFilePaths: v.array(v.string()),
  }),
);

test('preset receives effective config and exact managed paths; successful hints survive', async () => {
  const projectRoot = await createTypeScriptProject('clean-function/src/index.ts');
  await install('context-check');
  const result = await executeVerify(
    {
      projectRoot,
      entries: ['src/index.ts'],
      presets: ['database', 'context-check'],
      ignorePatterns: ['generated/**'],
      fallowIgnoreDependencies: ['sample-dependency'],
      skipPresetProjectChecks: true,
    },
    async (options) => Promise.resolve(emptyToolResult(options.args, options.name)),
  );
  expect(result.exitCode).toBe(0);
  const context = v.parse(ContextSchema, result.diagnostics[0]?.message);
  expect(context.projectRoot).toBe(projectRoot);
  expect(context.entries).toEqual(['src/index.ts']);
  expect(context.ignorePatterns).toContain('generated/**');
  expect(context.config.entry).toEqual(context.entries);
  expect(context.config.ignoreDependencies).toContain('sample-dependency');
  expect(context.managedFilePaths).toContain('system/database/migrate.ts');
  expect(context.managedFilePaths.every((path) => !path.startsWith('/'))).toBe(true);
  expect(result.hints).toEqual([{ kind: 'builtin', id: 'avoid-micro-splits' }]);
});

test('a rejected preset waits for another preset before ephemeral config cleanup', async () => {
  const projectRoot = await createTypeScriptProject('clean-function/src/index.ts');
  await install('held-check');
  await install('reject-check');
  let finished = false;
  const verification = Promise.allSettled([
    executeVerify(
      {
        projectRoot,
        entries: ['src/index.ts'],
        presets: ['held-check', 'reject-check'],
        presetConfig: { 'held-check': { mode: 'held' }, 'reject-check': { mode: 'reject' } },
        skipPresetProjectChecks: true,
      },
      async (options) => Promise.resolve(emptyToolResult(options.args, options.name)),
    ),
  ]).then(([result]) => {
    finished = true;
    return result;
  });
  try {
    const startedAt = performance.now();
    while (!existsSync(join(projectRoot, 'started'))) {
      if (performance.now() - startedAt > 2000) throw new Error('preset did not start');
      await sleep(5);
    }
    await sleep(30);
    expect(finished).toBe(false);
    const config = await readFile(join(projectRoot, 'started'), 'utf8');
    expect(existsSync(config)).toBe(true);
    await writeFile(join(projectRoot, 'release'), '');
    const outcome = await verification;
    expect(outcome.status).toBe('rejected');
    if (outcome.status !== 'rejected') throw new Error('Expected preset rejection');
    expect(String(outcome.reason)).toContain('preset rejected');
    expect(existsSync(join(projectRoot, 'finished'))).toBe(true);
    expect(existsSync(config)).toBe(true);
    expect(existsSync(join(projectRoot, '.aqg/fallow/preset-scratch.json'))).toBe(false);
  } finally {
    await writeFile(join(projectRoot, 'release'), '');
    await verification;
  }
});
