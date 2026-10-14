#!/usr/bin/env bun

import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import packageJson from '#package' with { type: 'json' };
import {
  OXLINT_CONFIG_NAME,
  readOxlintConfig,
} from '#system/config/verify-config-files/verify-config-files.js';
import { SHIPPED_PRESET_NAMES } from '#system/presets/preset-catalog.js';
import { writeTextFile } from '#system/process/files/files.js';
import {
  buildOxlintPluginBundle,
  packagePresetRoot,
} from '../package-preset-root/package-preset-root.js';
import { runRequired } from '../run-required/run-required.js';
import { createCli, parseCli } from '#system/process/command/command.js';
import { Option } from 'commander';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ARTIFACTS_DIR = join(REPO_ROOT, 'artifacts');

const SHARED_ENTRIES = [
  ['shared/verify', 'shared/verify', 'shared-verify'],
  ['shared/oxlint', 'shared/oxlint', 'shared-oxlint'],
  ['testing/oxlint', 'shared/tests/oxlint', 'testing-oxlint'],
] as const;

export function parseReleaseBuildArgs(argv: readonly string[]): boolean | 'help' {
  const program = createCli('build:release').addOption(
    new Option('--path-prefixes <mode>', 'Shorten paths in direct model responses only')
      .choices(['on', 'off'])
      .default('off'),
  );
  if (parseCli(program, argv) === 'help') {
    process.stdout.write(program.helpInformation());
    return 'help';
  }
  return program.opts<{ pathPrefixes: string }>().pathPrefixes === 'on';
}

let pathPrefixBuildArgs: readonly string[] = [];

function buildEsmBundle(entry: string, output: string, external: string): void {
  runRequired(
    'bun',
    [
      'build',
      '--target',
      'bun',
      '--format',
      'esm',
      ...pathPrefixBuildArgs,
      '--external',
      external,
      entry,
      '--outfile',
      output,
    ],
    REPO_ROOT,
    true,
  );
}

function buildPiExtension(output: string): void {
  buildEsmBundle('./adapters/pi/extension.ts', output, 'typebox');
}

function buildVerifyEntry(output: string): void {
  buildEsmBundle(
    './system/gate/run/execute-verify.ts',
    output,
    'fallow,oxlint,oxlint-plugin-eslint,oxlint-tsgolint,@oxlint/plugins',
  );
}

function buildLibraryEntry(entry: string, output: string): void {
  buildEsmBundle(
    entry,
    output,
    'fallow,oxlint,oxlint-plugin-eslint,oxlint-tsgolint,@oxlint/plugins,oxc-parser',
  );
}

function emitSharedDeclarations(output: string): void {
  runRequired(
    'bun',
    [
      'x',
      'tsc',
      '--ignoreConfig',
      '--declaration',
      '--emitDeclarationOnly',
      '--skipLibCheck',
      '--target',
      'ES2024',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--rootDir',
      '.',
      '--strict',
      '--types',
      'bun',
      '--allowImportingTsExtensions',
      '--outDir',
      output,
      ...SHARED_ENTRIES.map(([, source]) => `./${source}.ts`),
    ],
    REPO_ROOT,
    true,
  );
}

function buildCursorEntrypoint(entry: string, output: string): void {
  runRequired(
    'bun',
    [
      'build',
      '--target',
      'bun',
      '--format',
      'esm',
      ...pathPrefixBuildArgs,
      entry,
      '--outfile',
      output,
    ],
    REPO_ROOT,
    true,
  );
}

function buildInstallCli(output: string): void {
  runRequired(
    'bun',
    [
      'build',
      '--target',
      'bun',
      '--format',
      'esm',
      './system/scripts/install-local/install-local.ts',
      '--outfile',
      output,
    ],
    REPO_ROOT,
    true,
  );
}

async function writeReleasePackageJson(releasePackageDir: string): Promise<void> {
  const releasePackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    type: packageJson.type,
    description: packageJson.description,
    license: packageJson.license,
    author: packageJson.author,
    repository: packageJson.repository,
    homepage: packageJson.homepage,
    bugs: packageJson.bugs,
    keywords: packageJson.keywords,
    pi: {
      extensions: ['./dist/extensions/pi.js'],
    },
    engines: {
      bun: packageJson.engines.bun,
    },
    os: ['darwin', 'linux'],
    cpu: ['arm64', 'x64'],
    imports: {
      '#system/*.ts': './dist/types/system/*.d.ts',
      '#system/*': './dist/types/system/*',
    },
    exports: {
      './internal/*.ts': './dist/types/*.d.ts',
      './internal/*': './dist/types/*',
      ...Object.fromEntries(
        SHARED_ENTRIES.map(([entry, source, output]) => [
          `./${entry}`,
          {
            types: `./dist/types/${source}.d.ts`,
            default: `./dist/extensions/${output}.js`,
          },
        ]),
      ),
    },
    peerDependencies: {
      ...packageJson.peerDependencies,
      typebox: '*',
    },
    peerDependenciesMeta: packageJson.peerDependenciesMeta,
    dependencies: {
      '@oxlint/plugins': packageJson.dependencies['@oxlint/plugins'],
      fallow: packageJson.dependencies.fallow,
      'oxc-parser': packageJson.dependencies['oxc-parser'],
      oxlint: packageJson.dependencies.oxlint,
      'oxlint-plugin-eslint': packageJson.dependencies['oxlint-plugin-eslint'],
      'oxlint-tsgolint': packageJson.dependencies['oxlint-tsgolint'],
      mitata: packageJson.dependencies.mitata,
      typescript: packageJson.dependencies.typescript,
      valibot: packageJson.dependencies.valibot,
    },
    files: ['dist', 'docs', 'README.md', 'LICENSE'],
  };
  await writeTextFile(
    join(releasePackageDir, 'package.json'),
    `${JSON.stringify(releasePackageJson, null, 2)}\n`,
  );
}

async function copyPresetAssets(releaseDistDir: string): Promise<void> {
  const presetsSource = join(REPO_ROOT, 'presets');
  const presetsDestination = join(releaseDistDir, 'presets');
  for (const presetName of SHIPPED_PRESET_NAMES) {
    const sourceRoot = join(presetsSource, presetName);
    const destinationRoot = join(presetsDestination, presetName);
    await packagePresetRoot({
      sourceRoot,
      destinationRoot,
      bundleCwd: REPO_ROOT,
    });
  }
}

function packReleasePackage(releasePackageDir: string): void {
  runRequired(
    'bun',
    ['pm', 'pack', '--ignore-scripts', '--destination', ARTIFACTS_DIR],
    releasePackageDir,
    false,
  );
}

async function packageAssetsOxlintConfig(
  config: ReturnType<typeof readOxlintConfig>,
  assetsDir: string,
  releaseAssetsDir: string,
): Promise<ReturnType<typeof readOxlintConfig>> {
  const jsPlugins = config.jsPlugins ?? [];
  const nextPlugins = await Promise.all(
    jsPlugins.map(async (plugin) => {
      const specifier = plugin.specifier;
      if (
        specifier === undefined ||
        !specifier.startsWith('./oxlint/') ||
        !specifier.endsWith('.ts')
      ) {
        return plugin;
      }
      const sourceEntry = join(assetsDir, specifier);
      const packagedSpecifier = specifier.replace(/\.ts$/u, '.js');
      const output = join(releaseAssetsDir, packagedSpecifier);
      await mkdir(dirname(output), { recursive: true });
      buildOxlintPluginBundle(sourceEntry, output, REPO_ROOT);
      return {
        ...plugin,
        specifier: packagedSpecifier,
      };
    }),
  );
  return {
    ...config,
    jsPlugins: nextPlugins,
  };
}

async function main(): Promise<void> {
  const pathPrefixes = parseReleaseBuildArgs(process.argv.slice(2));
  if (pathPrefixes === 'help') return;
  pathPrefixBuildArgs = ['--define', `AQG_PATH_PREFIXES=${String(pathPrefixes)}`];
  const releasePackageDir = await mkdtemp(join(tmpdir(), 'agent-quality-gate-release-'));
  const releaseDistDir = join(releasePackageDir, 'dist');
  const releaseDistExtensionsDir = join(releaseDistDir, 'extensions');
  try {
    await rm(ARTIFACTS_DIR, { recursive: true, force: true });
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await mkdir(releaseDistExtensionsDir, { recursive: true });
    const releaseDistConfigsDir = join(releaseDistExtensionsDir, 'configs');
    await mkdir(releaseDistConfigsDir, { recursive: true });
    const verifyConfigsDir = join(REPO_ROOT, 'system', 'configs');
    const oxlintConfig = await packageAssetsOxlintConfig(
      readOxlintConfig(verifyConfigsDir),
      verifyConfigsDir,
      releaseDistConfigsDir,
    );
    await writeTextFile(
      join(releaseDistConfigsDir, OXLINT_CONFIG_NAME),
      `export default ${JSON.stringify(oxlintConfig, null, 2)};\n`,
    );
    await cp(
      join(verifyConfigsDir, '.fallowrc.json'),
      join(releaseDistConfigsDir, '.fallowrc.json'),
    );
    await cp(
      join(verifyConfigsDir, 'global-config.yaml'),
      join(releaseDistConfigsDir, 'global-config.yaml'),
    );
    for (const [, source, output] of SHARED_ENTRIES) {
      buildLibraryEntry(`./${source}.ts`, join(releaseDistExtensionsDir, `${output}.js`));
    }
    buildLibraryEntry('./shared/verify.ts', join(releaseDistExtensionsDir, 'public-verify.js'));
    emitSharedDeclarations(join(releaseDistDir, 'types'));
    buildPiExtension(join(releaseDistExtensionsDir, 'pi.js'));
    buildVerifyEntry(join(releaseDistExtensionsDir, 'verify.js'));
    const releaseDistCursorDir = join(releaseDistDir, 'cursor');
    const releaseDistClaudeDir = join(releaseDistDir, 'claude');
    const releaseDistCodexDir = join(releaseDistDir, 'codex');
    await mkdir(releaseDistCursorDir, { recursive: true });
    await mkdir(releaseDistClaudeDir, { recursive: true });
    await mkdir(releaseDistCodexDir, { recursive: true });
    for (const consumerDir of [
      releaseDistCursorDir,
      releaseDistClaudeDir,
      releaseDistCodexDir,
      releaseDistDir,
    ]) {
      await cp(releaseDistConfigsDir, join(consumerDir, 'configs'), { recursive: true });
    }
    for (const output of [
      join(releaseDistCursorDir, 'mcp-server.js'),
      join(releaseDistClaudeDir, 'mcp-server.js'),
      join(releaseDistCodexDir, 'mcp-server.js'),
    ]) {
      buildCursorEntrypoint('./adapters/mcp/stdio-server.ts', output);
    }
    buildCursorEntrypoint(
      './adapters/cursor/stop-hook.ts',
      join(releaseDistCursorDir, 'stop-hook.js'),
    );
    buildCursorEntrypoint(
      './adapters/hooks/session-stop-hook.ts',
      join(releaseDistClaudeDir, 'stop-hook.js'),
    );
    buildCursorEntrypoint(
      './adapters/hooks/session-stop-hook.ts',
      join(releaseDistCodexDir, 'stop-hook.js'),
    );
    buildInstallCli(join(releaseDistDir, 'install-cli.js'));
    await copyPresetAssets(releaseDistDir);
    await cp(join(REPO_ROOT, 'README.md'), join(releasePackageDir, 'README.md'));
    await cp(join(REPO_ROOT, 'docs'), join(releasePackageDir, 'docs'), { recursive: true });
    await cp(join(REPO_ROOT, 'LICENSE'), join(releasePackageDir, 'LICENSE'));
    await writeReleasePackageJson(releasePackageDir);
    packReleasePackage(releasePackageDir);
  } finally {
    await rm(releasePackageDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await main();
}
