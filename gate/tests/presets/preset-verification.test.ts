import { mkdir, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readTextFile, writeTextFile } from '../../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import { resolvePresetContract } from '../../../preset-catalog/catalog/preset-catalog.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  cleanupPresetVerificationProjects,
  cleanSourceFixtureCase,
  configDependencies,
  createProject,
  databaseDependencies,
  databaseDevDependencies,
  databaseIgnoreScripts,
  makeTempDirectory,
} from './preset-verification-project.js';

useIsolatedAgentQualityGateHome();

afterEach(async () => {
  await cleanupPresetVerificationProjects();
});

describe('preset verification', () => {
  it('resolves database transitively to include config and always keeps baseline', async () => {
    const database = await resolvePresetContract(['database']);
    expect(database.names).toEqual(['baseline', 'config', 'database']);
    expect(database.ignoreScripts).toEqual(['ssh2', 'cpu-features']);
    expect(database.files.some((file) => file.destination === 'system/config/environment.ts')).toBe(
      true,
    );
    expect(
      database.files.some((file) => file.destination === 'system/database/connection.ts'),
    ).toBe(true);
    expect(database.plugins.some((plugin) => plugin.name === 'aqg')).toBe(true);
    expect(database.rules['aqg/console-format-placeholders']).toBe('error');

    const config = await resolvePresetContract(['config']);
    expect(config.names).toEqual(['baseline', 'config']);
    expect(config.files.some((file) => file.destination === 'system/database/connection.ts')).toBe(
      false,
    );

    expect((await resolvePresetContract([])).names).toEqual(['baseline']);
    expect((await resolvePresetContract(['baseline'])).names).toEqual(['baseline']);
    expect((await resolvePresetContract([])).rules['aqg/no-inline-multiline-test-data']).toBe(
      'error',
    );
    expect(resolvePresetContract(['unknown'])).rejects.toThrow('unknown preset');
    expect(resolvePresetContract(['packages'])).rejects.toThrow('unknown preset');
    expect(resolvePresetContract(['project-quality'])).rejects.toThrow('unknown preset');
    expect(resolvePresetContract(['react-presentation'])).rejects.toThrow('unknown preset');
    expect(resolvePresetContract(['react-duplication'])).rejects.toThrow('unknown preset');
    expect(resolvePresetContract(['live-ui-surface'])).rejects.toThrow('unknown preset');
  });

  it('accepts config without deps and rejects incompatible database dependency ranges', async () => {
    const compatible = await createProject({
      fixtureCase: cleanSourceFixtureCase,
      dependencies: configDependencies,
    });
    const incompatible = await createProject({
      dependencies: databaseDependencies,
      devDependencies: { testcontainers: '11.0.0', '@testcontainers/postgresql': '12.0.4' },
      ignoreScripts: databaseIgnoreScripts,
      install: false,
    });
    const missing = await createProject({
      install: false,
    });

    const ok = await executeVerify({
      projectRoot: compatible,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(ok.exitCode).toBe(1);
    expect(ok.stderr).toContain('managed preset files do not match');
    expect(ok.stderr).toContain('system/config/environment.ts (missing)');
    expect(ok.stderr).toContain('example .aqg/config/system/config/environment.ts');

    const badRange = await executeVerify({
      projectRoot: incompatible,
      entries: ['src/index.ts'],
      presets: ['database'],
    });
    expect(badRange.exitCode).toBe(1);
    expect(badRange.stderr).toContain('incompatible');

    const missingDep = await executeVerify({
      projectRoot: missing,
      entries: ['src/index.ts'],
      presets: ['database'],
    });
    expect(missingDep.exitCode).toBe(1);
    expect(missingDep.stderr).toContain('missing');
  });

  it('rejects a devDependency that also appears in dependencies', async () => {
    const leaked = { testcontainers: '12.0.4', '@testcontainers/postgresql': '12.0.4' };
    const cwd = await createProject({
      dependencies: { ...databaseDependencies, ...leaked },
      devDependencies: databaseDevDependencies,
      ignoreScripts: databaseIgnoreScripts,
      install: false,
    });
    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['config', 'database'],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'belongs in "devDependencies" but also appears in "dependencies"',
    );
  });

  it('rejects database preset projects missing ignoreScripts for ssh2 and cpu-features', async () => {
    const cwd = await createProject({
      dependencies: databaseDependencies,
      devDependencies: databaseDevDependencies,
      install: false,
    });
    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['database'],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ignoreScripts');
    expect(result.stderr).toContain('ssh2');
    expect(result.stderr).toContain('cpu-features');
  });

  it('reports missing and modified managed files with .aqg examples and passes after copy', async () => {
    const cwd = await createProject({
      fixtureCase: cleanSourceFixtureCase,
      dependencies: configDependencies,
    });
    const request = {
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['config'] as const,
      fallowIgnoreDependencies: ['valibot'],
    };
    const managedPath = join(cwd, 'system', 'config', 'environment.ts');
    const examplePath = join(cwd, '.aqg', 'config', 'system', 'config', 'environment.ts');

    const first = await executeVerify(request);
    expect(first.exitCode).toBe(1);
    expect(first.stderr).toContain('system/config/environment.ts (missing)');
    expect(first.stderr).toContain('example .aqg/config/system/config/environment.ts');
    expect(existsSync(managedPath)).toBe(false);
    expect(existsSync(examplePath)).toBe(true);

    await mkdir(join(cwd, 'system', 'config'), { recursive: true });
    await writeTextFile(managedPath, await readTextFile(examplePath));

    const second = await executeVerify(request);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('verify: ok');

    await writeTextFile(managedPath, '// tampered\n');

    const third = await executeVerify(request);
    expect(third.exitCode).toBe(1);
    expect(third.stderr).toContain('system/config/environment.ts (modified)');
    expect(third.stderr).toContain('example .aqg/config/system/config/environment.ts');
    expect(await readTextFile(managedPath)).toBe('// tampered\n');

    await writeTextFile(managedPath, await readTextFile(examplePath));

    const fourth = await executeVerify(request);
    expect(fourth.exitCode).toBe(0);
    expect(fourth.stdout).toContain('verify: ok');
  });

  it('points database managed-file mismatches to the integration test example', async () => {
    const cwd = await createProject({
      dependencies: databaseDependencies,
      devDependencies: databaseDevDependencies,
      ignoreScripts: databaseIgnoreScripts,
      install: false,
    });

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['database'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('hint:database-examples — .aqg/database/database-examples.md');
  });

  it('refuses symlink destinations, symlink parents, and non-file destinations', async () => {
    const cwd = await createProject({
      dependencies: configDependencies,
      install: false,
    });
    await mkdir(join(cwd, 'system', 'config'), { recursive: true });
    await symlink(join(cwd, 'src', 'index.ts'), join(cwd, 'system', 'config', 'environment.ts'));

    const symlinkResult = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(symlinkResult.exitCode).toBe(1);
    expect(symlinkResult.stderr).toContain('symlink');

    const directoryProject = await createProject({
      dependencies: configDependencies,
      install: false,
    });
    await mkdir(join(directoryProject, 'system', 'config', 'environment.ts'), { recursive: true });
    const directoryResult = await executeVerify({
      projectRoot: directoryProject,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(directoryResult.exitCode).toBe(1);
    expect(directoryResult.stderr).toContain('non-file');

    const outside = await makeTempDirectory('aqg-preset-outside-');
    const parentLinkProject = await createProject({
      dependencies: configDependencies,
      install: false,
    });
    await mkdir(join(outside, 'config'), { recursive: true });
    await symlink(outside, join(parentLinkProject, 'system'));

    const missingThroughLink = await executeVerify({
      projectRoot: parentLinkProject,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(missingThroughLink.exitCode).toBe(1);
    expect(missingThroughLink.stderr).toContain('symlink parent');
    expect(existsSync(join(outside, 'config', 'environment.ts'))).toBe(false);

    await writeTextFile(join(outside, 'config', 'environment.ts'), '// tampered\n');
    const modifiedThroughLink = await executeVerify({
      projectRoot: parentLinkProject,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(modifiedThroughLink.exitCode).toBe(1);
    expect(modifiedThroughLink.stderr).toContain('symlink parent');
    expect(await readTextFile(join(outside, 'config', 'environment.ts'))).toBe('// tampered\n');

    const partialOutside = await makeTempDirectory('aqg-preset-partial-outside-');
    const partialProject = await createProject({
      dependencies: databaseDependencies,
      devDependencies: {
        '@testcontainers/postgresql': '12.0.4',
        testcontainers: '12.0.4',
      },
      ignoreScripts: databaseIgnoreScripts,
      install: false,
    });
    await mkdir(join(partialOutside, 'setup'), { recursive: true });
    await symlink(partialOutside, join(partialProject, 'tests'));

    const partial = await executeVerify({
      projectRoot: partialProject,
      entries: ['src/index.ts'],
      presets: ['database'],
    });
    expect(partial.exitCode).toBe(1);
    expect(partial.stderr).toContain('symlink parent');
    expect(partial.stderr).toContain('tests/setup/testDatabase.ts');
    expect(existsSync(join(partialProject, 'system', 'config', 'environment.ts'))).toBe(false);
    expect(existsSync(join(partialProject, 'system', 'database', 'connection.ts'))).toBe(false);
    expect(existsSync(join(partialOutside, 'setup', 'testDatabase.ts'))).toBe(false);
  });

  it('skips oxlint and fallow when preflight fails', async () => {
    const cwd = await createProject({
      fixtureCase: 'debugger-with-export',
      install: false,
    });

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['database'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('preset dependency check failed');
    expect(result.stderr).not.toContain('eslint(no-debugger)');
  });

  it('enforces preset oxlint rules only when the preset is active', async () => {
    const withPreset = await createProject({
      fixtureCase: 'env-token',
      dependencies: configDependencies,
    });
    const withoutPreset = await createProject({
      install: false,
    });

    const missing = await executeVerify({
      projectRoot: withPreset,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain('managed preset files do not match');
    expect(missing.stderr).toContain('example .aqg/config/system/config/environment.ts');

    const examplePath = join(withPreset, '.aqg', 'config', 'system', 'config', 'environment.ts');
    await mkdir(join(withPreset, 'system', 'config'), { recursive: true });
    await writeTextFile(
      join(withPreset, 'system', 'config', 'environment.ts'),
      await readTextFile(examplePath),
    );

    const active = await executeVerify({
      projectRoot: withPreset,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(active.exitCode).not.toBe(0);
    expect(active.stdout + active.stderr).toContain('environment-boundaries');

    const inactive = await executeVerify({
      projectRoot: withoutPreset,
      entries: ['src/index.ts'],
    });
    expect(inactive.exitCode).toBe(0);
  });

  it('rejects bun test --concurrent scripts only when the database preset is active', async () => {
    const withDatabase = await createProject({
      dependencies: databaseDependencies,
      devDependencies: databaseDevDependencies,
      ignoreScripts: databaseIgnoreScripts,
      scripts: {
        test: 'bun test --concurrent',
        'test:unit': 'bun test ./tests --parallel',
      },
      install: false,
    });
    const withoutDatabase = await createProject({
      dependencies: configDependencies,
      scripts: {
        test: 'bun test --concurrent',
      },
      install: false,
    });

    const rejected = await executeVerify({
      projectRoot: withDatabase,
      entries: ['src/index.ts'],
      presets: ['database'],
    });
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr).toContain('database-concurrent-script:test');
    expect(rejected.stderr).not.toContain('database-concurrent-script:test:unit');
    expect(rejected.stderr).not.toContain('eslint(');

    const inactive = await executeVerify({
      projectRoot: withoutDatabase,
      entries: ['src/index.ts'],
      presets: ['config'],
    });
    expect(inactive.stderr).not.toContain('database-concurrent-script');
  });

  it('allows bun test --parallel scripts when the database preset is active', async () => {
    const cwd = await createProject({
      dependencies: databaseDependencies,
      devDependencies: databaseDevDependencies,
      ignoreScripts: databaseIgnoreScripts,
      scripts: {
        test: 'bun test --parallel --timeout 30000',
        'test:max': 'bun test --max-concurrency 4',
        'test:message': 'echo bun test --concurrent',
      },
      install: false,
    });

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['database'],
    });
    expect(result.stderr).not.toContain('database-concurrent-script');
  });
});
