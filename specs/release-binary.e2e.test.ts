import { existsSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { which } from 'bun';

import packageJson from '../package.json' with { type: 'json' };
import { spawnCommand } from '../src/verify/spawn.js';

const REPO_ROOT = join(import.meta.dir, '..');
const RELEASE_PACKAGE = join(REPO_ROOT, 'artifacts', `agent-quality-gate-${packageJson.version}.tgz`);
const tempDirectories: string[] = [];

async function createProject(source: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'quality-gate-binary-'));
  tempDirectories.push(cwd);
  await mkdir(join(cwd, 'src'));
  await writeFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'quality-gate-fixture',
        private: true,
        type: 'module',
        main: 'src/index.ts',
        scripts: {
          verify: 'verify',
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  await writeFile(join(cwd, 'src', 'index.ts'), source, 'utf8');
  return cwd;
}

async function installReleasePackage(cwd: string): Promise<string> {
  const install = await spawnCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd, false);
  if (install.exitCode !== 0) {
    throw new Error(install.stderr || install.stdout);
  }
  return join(cwd, 'node_modules', 'agent-quality-gate');
}

beforeAll(async () => {
  const result = await spawnCommand('bun', ['./bin/build-release-package.ts'], REPO_ROOT, false);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
});

afterAll(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('release package', () => {
  it('installs its tool dependencies and passes a valid project', async () => {
    const cwd = await createProject('export function double(value: number): number {\n  return value * 2;\n}\n');
    const installedPackage = await installReleasePackage(cwd);
    const directive = ['oxlint', 'disable'].join('-');
    for (const directory of ['.tmp', 'build', 'dist', 'tmp', join('specs', 'bin', 'fixtures')]) {
      await mkdir(join(cwd, directory), { recursive: true });
      await writeFile(join(cwd, directory, 'generated.ts'), `// ${directive}\nconst = ;\n`, 'utf8');
    }
    expect(existsSync(join(installedPackage, 'THIRD_PARTY_NOTICES.md'))).toBe(true);
    expect(existsSync(join(installedPackage, 'dist', 'tools'))).toBe(false);
    const installedManifest = await readFile(join(installedPackage, 'package.json'), 'utf8');
    expect(installedManifest).toContain('"fallow": "3.9.1"');
    expect(installedManifest).toContain('"oxlint": "1.75.0"');
    expect(installedManifest).toContain('"oxlint-plugin-eslint": "1.75.0"');
    expect(installedManifest).toContain('"oxlint-tsgolint": "7.0.2001"');

    const result = await spawnCommand('bun', ['run', '--silent', 'verify'], cwd, false);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout);
    }

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
  });

  it('reports a type error from installed Oxlint type checking', async () => {
    const cwd = await createProject('export const value: number = "invalid";\n');
    const installedPackage = await installReleasePackage(cwd);
    const fakeBin = join(cwd, 'fake-bin');
    const fakeNode = join(fakeBin, 'node');
    const nodePath = which('node');
    if (!nodePath) {
      throw new Error('Node executable not found');
    }
    await mkdir(fakeBin);
    await writeFile(fakeNode, '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(fakeNode, 0o755);

    const result = await spawnCommand(
      nodePath,
      [join(installedPackage, 'dist', 'bin', 'verify.js')],
      cwd,
      false,
      {
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('TS2322');
  });

  it('reports unused code from installed Fallow', async () => {
    const cwd = await createProject('export const value = 1;\n');
    await writeFile(join(cwd, 'src', 'unused.ts'), 'export const unused = 2;\n', 'utf8');
    await installReleasePackage(cwd);

    const result = await spawnCommand('bun', ['run', '--silent', 'verify'], cwd, false);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('Unused files');
  });

  it('reports repository-named scripts as unused target files', async () => {
    const cwd = await createProject('export const value = 1;\n');
    await mkdir(join(cwd, 'scripts'));
    await writeFile(join(cwd, 'scripts', 'check-lint-directives.ts'), 'export const unused = 2;\n', 'utf8');
    await installReleasePackage(cwd);

    const result = await spawnCommand('bun', ['run', '--silent', 'verify'], cwd, false);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('scripts/check-lint-directives.ts');
  });
});
