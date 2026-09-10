import { file, spawnSync, write } from 'bun';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packagedAssetsDirectory } from '../../../../config/packaged-assets/packaged-assets.ts';
import { resolvePresetContract } from '../../../../preset-catalog/catalog/preset-catalog.ts';
import { writeOxlintConfigForProject } from '../../../../preset-catalog/oxlint-config/write-oxlint-config.ts';
import { createEnv, getOptionalEnv } from '../../../../gate/read-env/read-env.ts';
import { isPlainObject } from '../../../../tests/support/is-plain-object.ts';
import type { Dict } from '../../../../tests/support/dict.types.ts';

export const PACKAGED_OXLINT_ASSETS = packagedAssetsDirectory();
const AQG_CHECKOUT = join(import.meta.dir, '..', '..', '..', '..');

const loadModule = createRequire(fileURLToPath(import.meta.url));
const OXLINT_BIN = join(dirname(loadModule.resolve('oxlint/package.json')), 'bin', 'oxlint');
const ESLINT_PLUGIN_ROOT = dirname(
  dirname(loadModule.resolve('oxlint-plugin-eslint/package.json')),
);

function tsgolintPath(): string {
  const tsgolintRequire = createRequire(loadModule.resolve('oxlint-tsgolint/package.json'));
  const nativePackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
  return join(dirname(tsgolintRequire.resolve(`${nativePackage}/package.json`)), 'tsgolint');
}

function stringList(value: unknown | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function ruleMap(value: unknown | undefined): Dict {
  if (!isPlainObject(value)) {
    return {};
  }
  return value;
}

function overrideList(value: unknown | undefined): Array<{ files: string[]; rules: object }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const overrides: Array<{ files: string[]; rules: object }> = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      continue;
    }
    overrides.push({
      files: stringList(entry.files),
      rules: ruleMap(entry.rules),
    });
  }
  return overrides;
}

function pluginList(value: unknown | undefined): Array<{ name: string; specifier: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const plugins: Array<{ name: string; specifier: string }> = [];
  for (const entry of value) {
    if (
      !isPlainObject(entry) ||
      typeof entry.name !== 'string' ||
      typeof entry.specifier !== 'string'
    ) {
      continue;
    }
    plugins.push({ name: entry.name, specifier: entry.specifier });
  }
  return plugins;
}

async function readGeneratedConfigObject(configPath: string): Promise<Dict> {
  const raw = await file(configPath).text();
  const prefix = 'export default ';
  const suffix = ';\n';
  if (!raw.startsWith(prefix) || !raw.endsWith(suffix)) {
    throw new Error(`unexpected oxlint config format at ${configPath}`);
  }
  const parsed: unknown = JSON.parse(raw.slice(prefix.length, -suffix.length));
  if (!isPlainObject(parsed)) {
    throw new Error(`unexpected oxlint config object at ${configPath}`);
  }
  return parsed;
}

export async function loadGeneratedConfig(configPath: string): Promise<{
  plugins: string[];
  rules: Dict;
  overrides: Array<{ files: string[]; rules: object }>;
  jsPlugins: Array<{ name: string; specifier: string }>;
}> {
  const config = await readGeneratedConfigObject(configPath);
  return {
    plugins: stringList(config.plugins),
    rules: ruleMap(config.rules),
    overrides: overrideList(config.overrides),
    jsPlugins: pluginList(config.jsPlugins),
  };
}

function specifierInAqgCheckout(specifier: string): string {
  const needle = '/node_modules/agent-quality-gate/';
  const index = specifier.lastIndexOf(needle);
  if (index === -1) {
    return specifier;
  }
  return join(AQG_CHECKOUT, specifier.slice(index + needle.length));
}

export async function writePresetConfig(
  projectRoot: string,
  presets: readonly string[],
): Promise<string> {
  const contract = await resolvePresetContract(presets);
  return writeOxlintConfigForProject(
    projectRoot,
    PACKAGED_OXLINT_ASSETS,
    contract.plugins.map((plugin) => ({
      ...plugin,
      absoluteSpecifier: specifierInAqgCheckout(plugin.absoluteSpecifier),
    })),
    contract.rules,
    contract.nativePlugins,
    contract.overrides,
  );
}

export async function writeDiagnosticConfig(
  projectRoot: string,
  presets: readonly string[],
): Promise<string> {
  const generatedPath = await writePresetConfig(projectRoot, presets);
  const generated = await readGeneratedConfigObject(generatedPath);
  const existingOptions = isPlainObject(generated.options) ? generated.options : {};
  const config = {
    ...generated,
    options: {
      ...existingOptions,
      typeAware: false,
      typeCheck: false,
    },
  };
  const diagnosticPath = join(projectRoot, 'oxlint.diagnostic.config.ts');
  await write(diagnosticPath, `export default ${JSON.stringify(config, null, 2)};\n`);
  return diagnosticPath;
}

export function runOxlint(projectRoot: string, configPath: string, sourcePath: string) {
  const nodePath = [ESLINT_PLUGIN_ROOT, getOptionalEnv('NODE_PATH')]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(':');
  const result = spawnSync({
    cmd: [process.execPath, OXLINT_BIN, '--format', 'agent', '--config', configPath, sourcePath],
    cwd: projectRoot,
    env: createEnv({
      NODE_PATH: nodePath,
      OXLINT_TSGOLINT_PATH: tsgolintPath(),
    }),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    output: `${result.stdout?.toString() ?? ''}${result.stderr?.toString() ?? ''}`,
    status: result.exitCode ?? 1,
  };
}
