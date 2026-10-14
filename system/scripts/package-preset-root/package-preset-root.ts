import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { contentHash } from '#system/presets/parse-preset-manifest.js';
import type { PresetManagedFile, PresetManifest } from '#system/presets/preset-contract.types.js';
import { parsePresetManifest } from '#system/presets/parse-preset-manifest.js';
import { pathExists, readBytesFileSync, writeTextFile } from '#system/process/files/files.js';
import { runRequired } from '../run-required/run-required.js';
import { packagedAssetsDirectory } from '#system/config/packaged-assets/packaged-assets.js';
import { withPackageResolutionAt } from '../source-package-resolution/source-package-resolution.js';

function buildEsmBundle(
  entry: string,
  output: string,
  cwd: string,
  externalPackages: 'all' | readonly string[],
  target: 'bun' | 'node' = 'bun',
  minify = false,
): void {
  const args = ['build', '--target', target, '--format', 'esm'];
  if (minify) {
    args.push('--minify');
  }
  if (externalPackages === 'all') {
    args.push('--packages', 'external');
  } else {
    for (const external of externalPackages) {
      args.push('--external', external);
    }
  }
  args.push(entry, '--outfile', output);
  runRequired('bun', args, cwd, true);
}

type PresetBundleKind = 'check' | 'oxlint-plugin';

function buildPresetModuleBundle(
  entry: string,
  output: string,
  cwd: string,
  kind: PresetBundleKind,
): void {
  const isOxlintPlugin = kind === 'oxlint-plugin';
  // Plugins run outside Bun and bundle shared AQG modules; checks bundle AQG modules and
  // retain TypeScript's lib.*.d.ts files for semantic analysis.
  buildEsmBundle(
    entry,
    output,
    cwd,
    isOxlintPlugin ? ['@oxlint/plugins', 'oxc-parser'] : ['typescript'],
    isOxlintPlugin ? 'node' : 'bun',
    isOxlintPlugin,
  );
}

/** Bundle a TypeScript Oxlint plugin entry to ESM JS (same externals as baseline release). */
export function buildOxlintPluginBundle(entry: string, output: string, cwd: string): void {
  buildPresetModuleBundle(entry, output, cwd, 'oxlint-plugin');
}

async function readManifest(
  sourceRoot: string,
): Promise<{ path: string; parsed: PresetManifest; name: string }> {
  const path = join(sourceRoot, 'manifest.json');
  if (!(await pathExists(path))) {
    throw new Error(`preset root ${sourceRoot} is missing manifest.json`);
  }
  try {
    const parsed = await parsePresetManifest(path);
    return { path, parsed, name: parsed.name };
  } catch {
    throw new Error(`preset manifest ${path} must declare a non-empty name`);
  }
}

export async function copyOptionalPresetReadme(
  sourceRoot: string,
  destinationRoot: string,
): Promise<void> {
  const readmeSource = join(sourceRoot, 'README.md');
  if (existsSync(readmeSource)) {
    await cp(readmeSource, join(destinationRoot, 'README.md'));
  }
}

function packageOptionalTsBundle(
  sourceRoot: string,
  destinationRoot: string,
  bundleCwd: string,
  basename: string,
): void {
  const source = join(sourceRoot, `${basename}.ts`);
  if (!existsSync(source)) {
    return;
  }
  buildPresetModuleBundle(source, join(destinationRoot, `${basename}.js`), bundleCwd, 'check');
}

function packagedPluginSpecifier(specifier: string): string {
  return specifier.replace(/\.ts$/u, '.js');
}

async function packageOxlintPlugins(
  sourceRoot: string,
  destinationRoot: string,
  bundleCwd: string,
  manifest: PresetManifest,
) {
  const plugins: Array<{ name: string; specifier: string }> = [];
  for (const plugin of manifest.oxlint.plugins) {
    const { specifier } = plugin;
    const sourceEntry = join(sourceRoot, specifier);
    if (!existsSync(sourceEntry)) {
      throw new Error(`oxlint plugin entry missing: ${sourceEntry}`);
    }
    if (specifier.endsWith('.ts')) {
      const outSpecifier = packagedPluginSpecifier(specifier);
      const output = join(destinationRoot, outSpecifier);
      await mkdir(dirname(output), { recursive: true });
      buildOxlintPluginBundle(sourceEntry, output, bundleCwd);
      plugins.push({ ...plugin, specifier: outSpecifier });
      continue;
    }
    const output = join(destinationRoot, specifier);
    await mkdir(dirname(output), { recursive: true });
    await cp(sourceEntry, output);
    plugins.push(plugin);
  }

  return {
    ...manifest.oxlint,
    plugins,
  };
}

function packageManagedFiles(
  sourceRoot: string,
  files: readonly PresetManagedFile[],
): PresetManagedFile[] {
  return files.map((file) => {
    const absoluteSource = join(sourceRoot, file.source);
    if (!existsSync(absoluteSource)) {
      throw new Error(`managed preset source missing: ${absoluteSource}`);
    }
    return {
      ...file,
      contentHash: contentHash(readBytesFileSync(absoluteSource)),
    };
  });
}

/** Package one preset source root into a destination root (manifest, payload, oxlint, check.js, gate-config.js). */
export async function packagePresetRoot(
  options: PackagePresetRootOptions,
): Promise<{ name: string }> {
  const { sourceRoot, destinationRoot } = options;
  const bundleCwd = options.bundleCwd ?? sourceRoot;
  return withPackageResolutionAt(bundleCwd, resolve(import.meta.dir, '../../..'), async () => {
    const { parsed: sourceManifest, name } = await readManifest(sourceRoot);
    const examplesMarkdownBuilder = join(sourceRoot, 'build-examples-md.ts');
    if (existsSync(examplesMarkdownBuilder)) {
      runRequired('bun', [examplesMarkdownBuilder], sourceRoot, true);
    }
    await mkdir(destinationRoot, { recursive: true });
    await cp(packagedAssetsDirectory(), join(destinationRoot, 'configs'), { recursive: true });
    await copyOptionalPresetReadme(sourceRoot, destinationRoot);
    const payloadSource = join(sourceRoot, 'payload');
    if (existsSync(payloadSource)) {
      await cp(payloadSource, join(destinationRoot, 'payload'), { recursive: true });
    }
    const packagedManifest: PresetManifest = {
      ...sourceManifest,
      files: packageManagedFiles(sourceRoot, sourceManifest.files),
      oxlint: await packageOxlintPlugins(sourceRoot, destinationRoot, bundleCwd, sourceManifest),
    };
    await writeTextFile(
      join(destinationRoot, 'manifest.json'),
      `${JSON.stringify(packagedManifest, null, 2)}\n`,
    );
    packageOptionalTsBundle(sourceRoot, destinationRoot, bundleCwd, 'check');
    packageOptionalTsBundle(sourceRoot, destinationRoot, bundleCwd, 'gate-config');
    return { name };
  });
}

export type PackagePresetRootOptions = {
  sourceRoot: string;
  destinationRoot: string;
  /** Working directory for bundling `check.ts` (module resolution). Defaults to `sourceRoot`. */
  bundleCwd?: string;
};
