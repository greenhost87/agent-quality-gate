import { copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { writeTextFile } from '../../../process/files/files.js';
import { runCapturedProcess } from '../../../process/run-command/run-command.js';

import { afterEach, describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import {
  SHIPPED_PRESET_NAMES,
  resolvePresetContract,
} from '../../../preset-catalog/catalog/preset-catalog.js';
import type { PresetProjectDependency } from '../../../preset-catalog/contract/preset-contract.types.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];

function dependencySections(dependencies: readonly PresetProjectDependency[]): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const sections: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  } = {
    dependencies: {},
    devDependencies: {},
  };
  for (const dependency of dependencies) {
    sections[dependency.section][dependency.name] = dependency.version;
  }
  if (dependencies.length > 0) {
    sections.devDependencies['@types/bun'] = '1.4.0';
  }
  return sections;
}

function compositionCases(): string[][] {
  return [
    SHIPPED_PRESET_NAMES.filter((name) => name !== 'database-sqlite'),
    SHIPPED_PRESET_NAMES.filter((name) => name !== 'database'),
    ['config', 'database'],
    ['config', 'database-sqlite'],
  ];
}

async function installSharedDependencies(root: string): Promise<void> {
  const contract = await resolvePresetContract(
    SHIPPED_PRESET_NAMES.filter((name) => name !== 'database-sqlite'),
  );
  const sections = dependencySections(contract.dependencies);
  sections.devDependencies['bun-types'] = '1.4.0';
  await writeTextFile(
    join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'preset-composition-root',
        private: true,
        ...(contract.ignoreScripts.length > 0 ? { ignoreScripts: contract.ignoreScripts } : {}),
        ...sections,
      },
      null,
      2,
    )}\n`,
  );
  const result = await runCapturedProcess({ command: 'bun', args: ['install'], cwd: root });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.exitCode !== 0) {
    throw new Error(`bun install failed: ${result.stderr || result.stdout}`);
  }
}

async function createProject(root: string, presets: readonly string[]): Promise<string> {
  const contract = await resolvePresetContract(presets);
  const cwd = join(root, contract.names.join('-'));
  const sections = dependencySections(contract.dependencies);
  if (contract.names.includes('database')) {
    sections.devDependencies['bun-types'] = '1.4.0';
  }
  await mkdir(join(cwd, 'src'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(cwd, 'node_modules'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: `preset-composition-${contract.names.join('-')}`,
        private: true,
        type: 'module',
        ...(contract.ignoreScripts.length > 0 ? { ignoreScripts: contract.ignoreScripts } : {}),
        ...sections,
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'Preserve',
          moduleResolution: 'Bundler',
          noEmit: true,
          paths: { '@/*': ['./*'] },
          skipLibCheck: true,
          strict: true,
          target: 'ES2022',
          ...(contract.dependencies.length > 0 || contract.names.includes('database-sqlite')
            ? {
                typeRoots: [join(root, 'node_modules', '@types'), join(root, 'node_modules')],
                types:
                  contract.names.includes('database') || contract.names.includes('database-sqlite')
                    ? ['node', 'bun-types']
                    : ['node'],
              }
            : {}),
        },
        include: ['src/**/*.ts', 'system/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await writeTextFile(join(cwd, 'src', 'index.ts'), 'export const value = 1;\n');
  for (const file of contract.files) {
    const destinationAbsolute = join(cwd, file.destination);
    await mkdir(dirname(destinationAbsolute), { recursive: true });
    await copyFile(file.absoluteSource, destinationAbsolute);
  }
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('preset composition', () => {
  it('passes verification for every compatible complete set and dependent pair', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aqg-preset-composition-'));
    tempDirectories.push(root);
    await installSharedDependencies(root);

    for (const presets of compositionCases()) {
      const contract = await resolvePresetContract(presets);
      const cwd = await createProject(root, presets);
      const entries = [
        'src/index.ts',
        ...contract.files
          .map((file) => file.destination)
          .filter((destination) => /\.[cm]?[jt]sx?$/u.test(destination)),
      ];
      const verified = await executeVerify({
        projectRoot: cwd,
        entries,
        presets,
        presetConfig: presets.includes('test-colocation')
          ? { 'test-colocation': { policy: 'application' } }
          : {},
        fallowIgnoreDependencies: ['valibot', '@testcontainers/postgresql', 'testcontainers'],
      });
      expect(verified.exitCode, `${contract.names.join(' + ')}: ${JSON.stringify(verified)}`).toBe(
        0,
      );
    }
  }, 120_000);
});
