import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { createDefaultVerifyStepsResult } from '../src/verify/default-steps.js';
import { runVerify } from '../src/verify/run-verify.js';
import { spawnCommand } from '../src/verify/spawn.js';
import type { BuiltinVerifyStepName, VerifyStep } from '../src/verify/types.js';

const tempDirectories: string[] = [];

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
  return cwd;
}

function defaultStep(name: BuiltinVerifyStepName): VerifyStep {
  const step = createDefaultVerifyStepsResult().steps.find((candidate) => candidate.name === name);
  if (!step) {
    throw new Error(`Missing default step: ${name}`);
  }
  return step;
}

async function runLintDirectiveCli(cwd: string) {
  return spawnCommand(
    'bun',
    [join(import.meta.dir, '..', 'bin', 'verify.ts'), '--agent-quality-gate-internal', 'lint-directives'],
    cwd,
    false
  );
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('verify plan', () => {
  it('uses the locked current quality stack', () => {
    const result = createDefaultVerifyStepsResult();

    expect(result.steps.map((step) => step.name)).toEqual(['lint-directives', 'oxlint', 'fallow']);
    expect(result.stepDebugInfo.map((step) => step.source)).toEqual(['bundled', 'bundled', 'bundled']);
    for (const info of result.stepDebugInfo) {
      if (info.configPath) {
        expect(existsSync(info.configPath)).toBe(true);
      }
    }
  });

  it('restores every bundled file before constructing a new plan', async () => {
    const initial = createDefaultVerifyStepsResult();
    const oxlintPath = initial.stepDebugInfo.find((step) => step.name === 'oxlint')?.configPath;
    if (!oxlintPath) {
      throw new Error('Missing Oxlint config path');
    }
    const outputDirectory = dirname(oxlintPath);
    const paths = [
      join(outputDirectory, '.fallowrc.json'),
      oxlintPath,
      join(outputDirectory, 'oxlint-quality-plugin.mjs'),
      join(outputDirectory, 'oxlint-ui-plugin.mjs'),
    ];
    const expectedContents = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
    await Promise.all(paths.map((path) => writeFile(path, 'poisoned cache\n', 'utf8')));

    createDefaultVerifyStepsResult();

    const restoredContents = await Promise.all(paths.map((path) => readFile(path, 'utf8')));
    expect(restoredContents).toEqual(expectedContents);
  });

  it('passes every configured target exclusion directly to Oxlint', () => {
    const step = defaultStep('oxlint');
    const ignorePatterns = step.args.flatMap((argument, index) =>
      step.args[index - 1] === '--ignore-pattern' ? [argument] : []
    );

    expect(ignorePatterns).toEqual([
      '.codex/**',
      '.claude/**',
      '.fallow/**',
      '.idea/**',
      '.tmp/**',
      'artifacts/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'specs/bin/fixtures/**',
      'tmp/**',
    ]);
  });
});

describe('lint directive scanner', () => {
  it('rejects inline directives through the normal internal CLI path', async () => {
    const cwd = await makeTempDirectory('quality-gate-directives-');
    await mkdir(join(cwd, 'src'));
    const directive = ['oxlint', 'disable'].join('-');
    await writeFile(join(cwd, 'src', 'index.ts'), `// ${directive} no-console\nexport const value = 1;\n`, 'utf8');

    const result = await runLintDirectiveCli(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Inline lint directives are forbidden');
    expect(result.stderr).toContain('src/index.ts:1');
  });

  it('ignores generated build, dist, and tmp directories', async () => {
    const cwd = await makeTempDirectory('quality-gate-generated-directives-');
    const directive = ['eslint', 'disable'].join('-');
    for (const directory of ['build', 'dist', 'tmp']) {
      await mkdir(join(cwd, directory));
      await writeFile(join(cwd, directory, 'generated.ts'), `// ${directive}\nexport const value = 1;\n`, 'utf8');
    }

    const result = await runLintDirectiveCli(cwd);

    expect(result.exitCode).toBe(0);
  });

  it('checks nested source directories named build, dist, and tmp', async () => {
    const cwd = await makeTempDirectory('quality-gate-nested-directives-');
    const directive = ['oxlint', 'disable'].join('-');
    for (const directory of ['build', 'dist', 'tmp']) {
      await mkdir(join(cwd, 'src', directory), { recursive: true });
      await writeFile(join(cwd, 'src', directory, 'index.ts'), `// ${directive}\nexport const value = 1;\n`, 'utf8');
    }

    const result = await runLintDirectiveCli(cwd);

    expect(result.exitCode).toBe(1);
    for (const directory of ['build', 'dist', 'tmp']) {
      expect(result.stderr).toContain(join('src', directory, 'index.ts'));
    }
  });
});

describe('bundled policy', () => {
  it('ignores target files matched by the bundled Oxlint exclusions', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    for (const directory of [
      '.codex',
      '.claude',
      '.fallow',
      '.idea',
      '.tmp',
      'artifacts',
      'build',
      'dist',
      'node_modules',
      'coverage',
      join('specs', 'bin', 'fixtures'),
      'tmp',
    ]) {
      await mkdir(join(cwd, directory), { recursive: true });
      await writeFile(join(cwd, directory, 'invalid.ts'), 'const = ;\n', 'utf8');
    }

    const step = defaultStep('oxlint');
    const result = await spawnCommand(step.command, step.args, cwd, false, step.environment);

    expect(result.exitCode).toBe(0);
  });

  it('checks nested source directories named build, dist, and tmp with Oxlint', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    for (const directory of ['build', 'dist', 'tmp']) {
      await mkdir(join(cwd, 'src', directory), { recursive: true });
      await writeFile(join(cwd, 'src', directory, 'invalid.ts'), 'const = ;\n', 'utf8');
    }

    const step = defaultStep('oxlint');
    const result = await spawnCommand(step.command, step.args, cwd, false, step.environment);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    for (const directory of ['build', 'dist', 'tmp']) {
      expect(output).toContain(join('src', directory, 'invalid.ts'));
    }
  });

  it('does not apply application-specific pg or DAO restrictions to generic source', async () => {
    const cwd = await createTypeScriptProject(
      "import { marker } from 'pg';\nexport class GenericDao {\n  read(value = marker): string {\n    return value;\n  }\n}\n"
    );
    await mkdir(join(cwd, 'node_modules', 'pg'), { recursive: true });
    await writeFile(
      join(cwd, 'node_modules', 'pg', 'package.json'),
      '{"name":"pg","version":"1.0.0","type":"module","exports":{".":{"types":"./index.d.ts","default":"./index.js"}}}\n',
      'utf8'
    );
    await writeFile(join(cwd, 'node_modules', 'pg', 'index.d.ts'), 'export const marker: string;\n', 'utf8');
    await writeFile(join(cwd, 'node_modules', 'pg', 'index.js'), "export const marker = 'value';\n", 'utf8');

    const step = defaultStep('oxlint');
    const result = await spawnCommand(step.command, step.args, cwd, false, step.environment);

    expect(result.exitCode).toBe(0);
  });

  it('checks migration files with Fallow', async () => {
    const cwd = await createTypeScriptProject('export const value = 1;\n');
    await mkdir(join(cwd, 'migrations'));
    await writeFile(join(cwd, 'migrations', '001-create.ts'), 'export const migration = 1;\n', 'utf8');

    const step = defaultStep('fallow');
    const result = await spawnCommand(step.command, step.args, cwd, false, step.environment);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('migrations/001-create.ts');
  });
});

describe('verify runner', () => {
  it('runs every step and returns the first failure code', async () => {
    const cwd = await makeTempDirectory('quality-gate-runner-');
    const firstScriptPath = join(cwd, 'first-failure.mjs');
    const secondScriptPath = join(cwd, 'second-failure.mjs');
    const markerPath = join(cwd, 'second-step-ran');
    await writeFile(firstScriptPath, 'process.exitCode = 17;\n', 'utf8');
    await writeFile(
      secondScriptPath,
      "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.argv[2], 'ran');\nprocess.exitCode = 9;\n",
      'utf8'
    );
    const steps: VerifyStep[] = [
      { name: 'oxlint', command: 'node', args: [firstScriptPath] },
      { name: 'fallow', command: 'node', args: [secondScriptPath, markerPath] },
    ];

    const result = await runVerify(steps, { cwd, collectTimings: true });

    expect(result.code).toBe(17);
    expect(existsSync(markerPath)).toBe(true);
    expect(result.timings?.steps.map((step) => step.name)).toEqual(['oxlint', 'fallow']);
  });
});
