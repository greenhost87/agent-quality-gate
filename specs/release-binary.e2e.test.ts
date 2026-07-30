import { existsSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'bun:test';
import { spawn, which } from 'bun';

import packageJson from '../package.json' with { type: 'json' };

const REPO_ROOT = join(import.meta.dir, '..');
const RELEASE_PACKAGE = join(REPO_ROOT, 'artifacts', `agent-quality-gate-${packageJson.version}.tgz`);
const tempDirectories: string[] = [];

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  environment?: Record<string, string>
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const child = spawn([command, ...args], {
    cwd,
    env: { ...process.env, ...environment },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

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
  await writeFile(
    join(cwd, 'agent-quality-gate.config.json'),
    `${JSON.stringify(
      {
        entries: ['src/index.ts'],
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return cwd;
}

async function installReleasePackage(cwd: string): Promise<string> {
  const install = await runCommand('bun', ['add', '--dev', RELEASE_PACKAGE], cwd);
  if (install.exitCode !== 0) {
    throw new Error(install.stderr || install.stdout);
  }
  return join(cwd, 'node_modules', 'agent-quality-gate');
}

afterAll(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('release package', () => {
  it('installs its tool dependencies and passes a valid project', async () => {
    const cwd = await createProject('export function double(value: number): number {\n  return value * 2;\n}\n');
    const installedPackage = await installReleasePackage(cwd);
    await mkdir(join(cwd, 'migrations'));
    await writeFile(join(cwd, 'migrations', '001-unused.ts'), 'export const unusedMigration = 1;\n', 'utf8');
    await writeFile(
      join(cwd, 'agent-quality-gate.config.json'),
      `${JSON.stringify(
        {
          entries: ['src/index.ts'],
          fallowIgnorePatterns: ['migrations/**'],
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const directive = ['oxlint', 'disable'].join('-');
    for (const directory of ['.tmp', 'build', 'dist', 'tmp']) {
      await mkdir(join(cwd, directory), { recursive: true });
      await writeFile(join(cwd, directory, 'generated.ts'), `// ${directive}\nconst = ;\n`, 'utf8');
    }
    const installedManifest = await readFile(join(installedPackage, 'package.json'), 'utf8');
    expect(installedManifest).toContain('"fallow": "3.9.1"');
    expect(installedManifest).toContain('"oxlint": "1.75.0"');
    expect(installedManifest).toContain('"oxlint-plugin-eslint": "1.75.0"');
    expect(installedManifest).toContain('"oxlint-tsgolint": "7.0.2001"');

    const result = await runCommand('bun', ['run', '--silent', 'verify'], cwd);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout);
    }

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
    expect(existsSync(join(installedPackage, 'dist', 'plugins', 'quality', 'index.mjs'))).toBe(true);
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

    const result = await runCommand(
      nodePath,
      [join(installedPackage, 'dist', 'bin', 'verify.js')],
      cwd,
      {
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('TS2322');
  });

  it('runs a project plugin without disabling locked rules', async () => {
    const cwd = await createProject(
      'export function customViolation(value: any): number {\n  debugger;\n  return value;\n}\n'
    );
    await mkdir(join(cwd, 'project-quality'));
    await writeFile(
      join(cwd, 'project-quality', 'plugin.mjs'),
      `const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { forbidden: 'customViolation is forbidden.' },
  },
  create(context) {
    return {
      Identifier(node) {
        if (node.name === 'customViolation') {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};

export default {
  meta: { name: 'project' },
  rules: { 'no-custom-identifier': rule },
};
`,
      'utf8'
    );
    await writeFile(
      join(cwd, 'agent-quality-gate.config.json'),
      `${JSON.stringify(
        {
          entries: ['src/index.ts'],
          plugins: [
            {
              name: 'project',
              specifier: './project-quality/plugin.mjs',
              rules: {
                'project/no-custom-identifier': 'error',
              },
            },
          ],
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    await installReleasePackage(cwd);

    const result = await runCommand('bun', ['run', '--silent', 'verify'], cwd);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('project(no-custom-identifier)');
    expect(output).toContain('eslint(no-debugger)');
  });

  it('runs configured native Oxlint plugins', async () => {
    const cwd = await createProject(
      'const module = 1;\n\nfunction useFeature(): number {\n  return 1;\n}\n\nexport function run(active: boolean): number {\n  return active ? useFeature() : module;\n}\n'
    );
    await writeFile(
      join(cwd, 'agent-quality-gate.config.json'),
      `${JSON.stringify(
        {
          entries: ['src/index.ts'],
          plugins: [
            {
              name: 'nextjs',
              rules: {
                'nextjs/no-assign-module-variable': 'error',
              },
            },
            {
              name: 'react',
              rules: {
                'react/rules-of-hooks': 'error',
              },
            },
          ],
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    await installReleasePackage(cwd);

    const result = await runCommand('bun', ['run', '--silent', 'verify'], cwd);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('next(no-assign-module-variable)');
    expect(output).toContain('react-hooks(rules-of-hooks)');
  });

  it('reports unused code from installed Fallow', async () => {
    const cwd = await createProject('export const value = 1;\n');
    await writeFile(join(cwd, 'src', 'unused.ts'), 'export const unused = 2;\n', 'utf8');
    await installReleasePackage(cwd);

    const result = await runCommand('bun', ['run', '--silent', 'verify'], cwd);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('Unused files');
  });
});
