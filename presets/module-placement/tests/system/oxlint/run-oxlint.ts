import { spawn, write } from 'bun';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { ModulePlacementOptions } from './run-oxlint.types.ts';

const oxlintPath = resolve('node_modules/.bin/oxlint');
const pluginPath = resolve(import.meta.dir, '../../../oxlint/module-placement.ts');
const fixturesRoot = resolve(import.meta.dir, '../../../.quality-fixtures');
const ruleName = 'module-placement/module-placement';

export type { ModulePlacementOptions } from './run-oxlint.types.ts';

async function writeRuleConfig(options?: ModulePlacementOptions) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'module-placement-')));
  const configPath = join(workspace, 'oxlint.json');
  await write(
    configPath,
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'module-placement', specifier: pluginPath }],
      rules: {
        [ruleName]: options === undefined ? 'error' : ['error', options],
      },
    }),
  );
  return { workspace, configPath };
}

export async function runOxlintFixture(
  fixture: string,
  entry: string,
  options?: ModulePlacementOptions,
) {
  const { workspace, configPath } = await writeRuleConfig(options);
  const caseRoot = join(fixturesRoot, fixture);
  const sourcePath = join(caseRoot, entry);
  const child = spawn({
    cmd: [oxlintPath, '--format', 'agent', '--config', configPath, sourcePath],
    cwd: caseRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  rmSync(workspace, { recursive: true, force: true });
  return {
    output: `${stdout}${stderr}`,
    status,
  };
}

export const piForemanOptions: ModulePlacementOptions = {
  directories: ['system/agents'],
  rootExceptions: {
    'system/agents': ['agents.types.ts'],
  },
};
