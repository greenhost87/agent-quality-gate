import { spawn, write } from 'bun';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const oxlintPath = resolve('node_modules/.bin/oxlint');
const pluginPath = resolve(import.meta.dir, '../../../oxlint/index.ts');
const fixturesRoot = resolve(import.meta.dir, '../../../.quality-fixtures');

async function writeRuleConfig(rule: string) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'bun-parse-oxlint-')));
  const configPath = join(workspace, 'oxlint.json');
  await write(
    configPath,
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'bun-parse', specifier: pluginPath }],
      rules: { [rule]: 'error' },
    }),
  );
  return { workspace, configPath };
}

export async function runOxlintFixture(fixture: string, entry: string, rule: string) {
  const { workspace, configPath } = await writeRuleConfig(rule);
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
