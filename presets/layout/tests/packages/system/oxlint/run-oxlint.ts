import { spawnSync, write } from 'bun';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const oxlintPath = resolve('node_modules/.bin/oxlint');
const pluginPath = resolve(import.meta.dir, '../../../../oxlint/package-boundaries.ts');
const fixturesRoot = resolve(import.meta.dir, '../../../../.quality-fixtures/packages');
const ruleName = 'packages/package-boundaries';

export const phoenixOptions = {
  allowedRootModules: [
    'config.ts',
    'instrumentation.ts',
    'next.config.ts',
    'playwright.config.ts',
    'postcss.config.mjs',
    'utils.ts',
    'validation.ts',
  ],
  declaredDependencies: {
    fabrics: ['media'],
    http: ['auth'],
    orders: ['shopify'],
  },
};

async function writeRuleConfig(options?: Record<string, unknown>) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'package-boundaries-')));
  const configPath = join(workspace, 'oxlint.json');
  await write(
    configPath,
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'packages', specifier: pluginPath }],
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
  options?: Record<string, unknown>,
) {
  const { workspace, configPath } = await writeRuleConfig(options);
  const caseRoot = join(fixturesRoot, fixture);
  const sourcePath = join(caseRoot, entry);
  const result = spawnSync({
    cmd: [process.execPath, oxlintPath, '--format', 'agent', '--config', configPath, sourcePath],
    cwd: caseRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  rmSync(workspace, { recursive: true, force: true });
  return {
    output: `${result.stdout?.toString() ?? ''}${result.stderr?.toString() ?? ''}`,
    status: result.exitCode,
  };
}
