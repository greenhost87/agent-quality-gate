import { spawn, write } from 'bun';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const oxlintPath = resolve('node_modules/.bin/oxlint');
const pluginPath = resolve(import.meta.dir, '../../oxlint/index.ts');
const fixturesRoot = resolve(import.meta.dir, '../../.quality-fixtures');

async function writeRuleConfig(rule: string, setting: OxlintRuleSetting) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'baseline-oxlint-')));
  const configPath = join(workspace, 'oxlint.json');
  await write(
    configPath,
    JSON.stringify({
      categories: { correctness: 'off' },
      jsPlugins: [{ name: 'aqg', specifier: pluginPath }],
      rules: { [rule]: setting },
    }),
  );
  return { workspace, configPath };
}

export async function runOxlintFixture(
  fixture: string,
  entry: string,
  rule: string,
  setting: OxlintRuleSetting = 'error',
) {
  const { workspace, configPath } = await writeRuleConfig(rule, setting);
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

export type OxlintRuleSetting = string | [string, ...unknown[]];
