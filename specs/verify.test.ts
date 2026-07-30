import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { resolveIgnoredPaths } from '../src/verify/config/policy.js';

const VERIFY_PATH = join(import.meta.dir, '..', 'bin', 'verify.ts');
const CONFIG_NAME = 'agent-quality-gate.config.json';
const tempDirectories: string[] = [];

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  environment?: Record<string, string>
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function createTypeScriptProject(source: string): Promise<string> {
  const cwd = await makeTempDirectory('quality-gate-project-');
  await mkdir(join(cwd, 'src'));
  await writeFile(
    join(cwd, 'package.json'),
    `${JSON.stringify(
      {
        name: 'quality-gate-fixture',
        private: true,
        type: 'module',
        main: 'src/index.ts',
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
    join(cwd, CONFIG_NAME),
    `${JSON.stringify({ entries: ['src/index.ts'] }, null, 2)}\n`,
    'utf8'
  );
  return cwd;
}

async function writeProjectConfig(cwd: string, value: object): Promise<void> {
  await writeFile(join(cwd, CONFIG_NAME), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runVerify(cwd: string, environment?: Record<string, string>) {
  return runCommand('bun', [VERIFY_PATH], cwd, environment);
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('verify', () => {
  it('rejects a missing or invalid project config', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    await rm(join(cwd, CONFIG_NAME));

    const missing = await runVerify(cwd);

    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).toContain(`${CONFIG_NAME} is required`);

    await writeFile(join(cwd, CONFIG_NAME), '{', 'utf8');
    const invalid = await runVerify(cwd);

    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr).toContain(`${CONFIG_NAME} must contain valid JSON`);
  });

  it('stops on a forbidden directive before creating native configs', async () => {
    const directive = ['oxlint', 'disable'].join('-');
    const cwd = await createTypeScriptProject(`// ${directive} no-console\nexport const value = 1;\n`);
    const systemTemp = await makeTempDirectory('quality-gate-system-tmp-');
    const result = await runVerify(cwd, { TMPDIR: systemTemp });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Inline lint directives are forbidden');
    expect((await readdir(systemTemp)).filter((name) => name.startsWith('agent-quality-gate-'))).toEqual([]);
  });

  it('enforces locked rules despite ESLint disable directives', async () => {
    const directive = ['eslint', 'disable-next-line'].join('-');
    const cwd = await createTypeScriptProject(`// ${directive} no-debugger\ndebugger;\nexport const value = 1;\n`);

    const result = await runVerify(cwd);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('eslint(no-debugger)');
  });

  it('ignores every locked root path', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    const directive = ['eslint', 'disable'].join('-');
    for (const directory of resolveIgnoredPaths()) {
      await mkdir(join(cwd, directory), { recursive: true });
      await writeFile(join(cwd, directory, 'generated.ts'), `// ${directive} no-console\nconst = ;\n`, 'utf8');
    }

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
  });

  it('rejects project-defined ignore paths', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    await writeProjectConfig(cwd, {
      entries: ['src/index.ts'],
      ignore: ['lib'],
    });

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('unknown root key "ignore"');
  });

  it('rejects invalid Fallow ignore patterns', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    await writeProjectConfig(cwd, {
      entries: ['src/index.ts'],
      fallowIgnorePatterns: ['../migrations/**'],
    });

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('fallowIgnorePatterns must contain root-relative globs');
  });

  it('keeps Fallow-ignored files covered by Oxlint', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    await mkdir(join(cwd, 'migrations'));
    await writeFile(join(cwd, 'migrations', '001-invalid.ts'), 'const = ;\n', 'utf8');
    await writeProjectConfig(cwd, {
      entries: ['src/index.ts'],
      fallowIgnorePatterns: ['migrations/**'],
    });

    const result = await runVerify(cwd);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('001-invalid.ts');
  });

  it('checks configured root paths when nested under source', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    const directive = ['oxlint', 'disable'].join('-');
    for (const directory of resolveIgnoredPaths()) {
      await mkdir(join(cwd, 'src', directory), { recursive: true });
      await writeFile(
        join(cwd, 'src', directory, 'index.ts'),
        `// ${directive} no-console\nexport const value = 1;\n`,
        'utf8'
      );
    }

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    for (const directory of resolveIgnoredPaths()) {
      expect(result.stderr).toContain(join('src', directory, 'index.ts'));
    }
  });

  it('removes native configs after a successful run', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    const systemTemp = await makeTempDirectory('quality-gate-system-tmp-');
    const result = await runVerify(cwd, { TMPDIR: systemTemp });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
    expect((await readdir(systemTemp)).filter((name) => name.startsWith('agent-quality-gate-'))).toEqual([]);
  });

  it('stores the Fallow cache under node_modules', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
    expect(await readdir(cwd)).not.toContain('.fallow');
    const cacheFiles = await readdir(join(cwd, 'node_modules', '.cache', 'agent-quality-gate', 'fallow'));
    expect(cacheFiles).toContain('.gitignore');
    expect(cacheFiles).toContain('cache.bin');
    expect(cacheFiles).toContain('graph-cache.bin');
  });

  it('checks nested generated-directory names with Oxlint', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    for (const directory of ['build', 'dist', 'tmp']) {
      await mkdir(join(cwd, 'src', directory), { recursive: true });
      await writeFile(join(cwd, 'src', directory, 'invalid.ts'), 'const = ;\n', 'utf8');
    }

    const result = await runVerify(cwd);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    for (const directory of ['build', 'dist', 'tmp']) {
      expect(output).toContain(join('src', directory, 'invalid.ts'));
    }
  });
});
