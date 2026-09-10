import { spawn, write } from 'bun';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const oxlintPath = resolve('node_modules/.bin/oxlint');
const pluginPath = resolve(import.meta.dir, '../../oxlint/index.ts');
const fixturesRoot = resolve(import.meta.dir, '../../.quality-fixtures');

async function writeRuleConfig(
  rules: Record<string, OxlintRuleSetting>,
  options: { usePlugin: boolean; plugins: string[]; jsPlugins: OxlintJsPlugin[] },
) {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'baseline-oxlint-')));
  const configPath = join(workspace, 'oxlint.json');
  await write(
    configPath,
    JSON.stringify({
      categories: { correctness: 'off' },
      ...(options.plugins.length > 0 ? { plugins: options.plugins } : {}),
      ...(options.usePlugin || options.jsPlugins.length > 0
        ? {
            jsPlugins: [
              ...(options.usePlugin ? [{ name: 'aqg', specifier: pluginPath }] : []),
              ...options.jsPlugins,
            ],
          }
        : {}),
      rules,
    }),
  );
  return { workspace, configPath };
}

export async function runOxlintFixture(
  fixture: string,
  entry: string,
  rule: string,
  setting: OxlintRuleSetting = 'error',
  options: { usePlugin?: boolean; plugins?: string[]; jsPlugins?: OxlintJsPlugin[] } = {},
) {
  return runOxlintFixtureRules(fixture, entry, { [rule]: setting }, options);
}

export async function runOxlintFixtureRules(
  fixture: string,
  entry: string,
  rules: Record<string, OxlintRuleSetting>,
  options: { usePlugin?: boolean; plugins?: string[]; jsPlugins?: OxlintJsPlugin[] } = {},
) {
  const usePlugin = options.usePlugin ?? true;
  const plugins = options.plugins ?? [];
  const jsPlugins = options.jsPlugins ?? [];
  const { workspace, configPath } = await writeRuleConfig(rules, {
    usePlugin,
    plugins,
    jsPlugins,
  });
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

type OxlintJsPlugin = { name: string; specifier: string };

export type OxlintRuleSetting = string | [string, ...unknown[]];
