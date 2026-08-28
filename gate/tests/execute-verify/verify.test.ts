import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { writeTextFile } from '../../../process/files/files.js';

import { describe, expect, it } from 'bun:test';

import { readOxlintConfig } from '../../../config/verify-config-files/verify-config-files.js';
import { executeVerify } from '../../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import { readFixture } from '../../../tests/support/fixture-files.js';
import {
  EXECUTE_VERIFY_FIXTURES_ROOT,
  EXECUTE_VERIFY_REPO_ROOT,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';

const IGNORED_PATHS = (
  readOxlintConfig(join(EXECUTE_VERIFY_REPO_ROOT, 'assets')).ignorePatterns ?? []
).map((pattern) => (pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern));

function ignoredDirectoryPaths(): string[] {
  return IGNORED_PATHS.filter((path) => {
    if (path === '.*') {
      return true;
    }
    const name = path.split('/').at(-1) ?? path;
    return name.startsWith('.') || !name.includes('.');
  });
}

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject, makeTempDirectory, runVerify, initializeGitRepository } =
  useExecuteVerifyProjects();

describe('verify', () => {
  it('runs checks even when only non-lintable files are dirty in a Git repository', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    await initializeGitRepository(cwd);
    await writeTextFile(join(cwd, 'README.md'), '# Documentation\n');

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain('eslint(no-debugger)');
  });

  it('enforces locked rules despite ESLint disable directives', async () => {
    const cwd = await createTypeScriptProject('locked-rules-directive/src/index.ts');

    const result = await runVerify(cwd);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('eslint(no-debugger)');
  });

  it('ignores every locked root path', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const generatedSource = await readFixture(
      EXECUTE_VERIFY_FIXTURES_ROOT,
      'ignored-paths/generated.txt',
    );
    const directories = ignoredDirectoryPaths().map((path) => (path === '.*' ? '.metadata' : path));
    for (const directory of directories) {
      await mkdir(join(cwd, directory), { recursive: true });
      await writeTextFile(join(cwd, directory, 'generated.ts'), generatedSource);
    }

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
  });

  it('ignores directives in arbitrary root dot directories', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const checkout = join(cwd, '.worktrees', 'feature');
    const generatedSource = await readFixture(
      EXECUTE_VERIFY_FIXTURES_ROOT,
      'dot-checkout-generated/generated.ts',
    );
    await mkdir(checkout, { recursive: true });
    await writeTextFile(join(checkout, 'generated.ts'), generatedSource);

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
  });

  it('ignores directives under project-specific ignored directories', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const fixtureDirectory = join(cwd, 'src', 'testdata');
    const generatedSource = await readFixture(
      EXECUTE_VERIFY_FIXTURES_ROOT,
      'ignored-project-directory/generated.ts',
    );
    await mkdir(fixtureDirectory, { recursive: true });
    await writeTextFile(join(fixtureDirectory, 'generated.ts'), generatedSource);

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      ignorePatterns: ['src/testdata/**'],
    });

    expect(result.exitCode).toBe(0);
  });

  it('ignores Oxlint issues in arbitrary root dot directories', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const checkout = join(cwd, '.worktrees', 'feature');
    await mkdir(checkout, { recursive: true });
    await writeTextFile(join(checkout, 'generated.ts'), 'const = ;\n');

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
  });

  it('ignores Fallow issues in arbitrary root dot directories', async () => {
    const unused = await readFixture(EXECUTE_VERIFY_FIXTURES_ROOT, 'fallow-unused/unused.ts');
    for (const [directory, expectedExitCode] of [
      ['worktrees', 1],
      ['.worktrees', 0],
    ] as const) {
      const cwd = await createTypeScriptProject('clean-function/src/index.ts');
      const checkout = join(cwd, directory, 'feature');
      await mkdir(checkout, { recursive: true });
      await writeTextFile(join(checkout, 'unused.ts'), unused);

      const result = await runVerify(cwd);

      expect(result.exitCode).toBe(expectedExitCode);
      if (expectedExitCode === 1) {
        expect(result.stdout + result.stderr).toContain('unused.ts');
      }
    }
  });

  it('ignores root dot-directory symlinks', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const target = await makeTempDirectory('quality-gate-dot-directory-target-');
    const generatedSource = await readFixture(
      EXECUTE_VERIFY_FIXTURES_ROOT,
      'ignored-paths/generated.txt',
    );
    await writeTextFile(join(target, 'generated.ts'), generatedSource);
    await symlink(target, join(cwd, '.worktree'), 'dir');

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
  });

  it('checks root dot files', async () => {
    const cwd = await createTypeScriptProject('export-value/src/index.ts');
    await writeTextFile(join(cwd, '.invalid.ts'), 'const = ;\n');

    const result = await runVerify(cwd);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('.invalid.ts');
  });

  it('checks nested dot directories with Oxlint', async () => {
    const cwd = await createTypeScriptProject('export-value/src/index.ts');
    const nestedDirectory = join(cwd, 'src', '.hidden');
    await mkdir(nestedDirectory);
    await writeTextFile(join(nestedDirectory, 'invalid.ts'), 'const = ;\n');

    const result = await runVerify(cwd);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain(join('src', '.hidden', 'invalid.ts'));
  });

  it('treats exports from configured entries as externally consumed', async () => {
    const cwd = await createTypeScriptProject('export-public-value/src/index.ts');

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
  });

  it('prints only actionable Fallow findings', async () => {
    const cwd = await createTypeScriptProject('fallow-workflow-import/src/index.ts');
    await writeTextFile(
      join(cwd, 'src', 'workflows.dao.ts'),
      await readFixture(
        EXECUTE_VERIFY_FIXTURES_ROOT,
        'fallow-workflow-import/src/workflows.dao.ts',
      ),
    );

    const result = await runVerify(cwd);

    const outputLines = result.stdout.split('\n');
    expect(result.exitCode).toBe(1);
    expect(outputLines).toContain('unused-class-member:src/workflows.dao.ts:2:WorkflowDao.create');
    expect(outputLines.some((line) => line.startsWith('vital-signs:'))).toBe(false);
    expect(outputLines.some((line) => line.startsWith('file-score:'))).toBe(false);
  });

  it('keeps Fallow-ignored files covered by Oxlint', async () => {
    const cwd = await createTypeScriptProject('export-value/src/index.ts');
    await mkdir(join(cwd, 'migrations'));
    await writeTextFile(join(cwd, 'migrations', '001-invalid.ts'), 'const = ;\n');

    const result = await runVerify(cwd);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('001-invalid.ts');
  });

  it('checks configured root paths when nested under source', async () => {
    const cwd = await createTypeScriptProject('export-value/src/index.ts');
    const nestedIndexSource = await readFixture(
      EXECUTE_VERIFY_FIXTURES_ROOT,
      'nested-src-index/index.ts',
    );
    const directories = IGNORED_PATHS.map((path) => (path === '.*' ? '.hidden' : path));
    for (const directory of directories) {
      await mkdir(join(cwd, 'src', directory), { recursive: true });
      await writeTextFile(join(cwd, 'src', directory, 'index.ts'), nestedIndexSource);
    }

    const result = await runVerify(cwd);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('aqg(no-oxlint-disable-directives)');
    for (const directory of directories) {
      expect(output).toContain(join('src', directory, 'index.ts'));
    }
  });

  it('stores the Fallow cache under node_modules', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
    expect(await readdir(cwd)).not.toContain('.fallow');
    const cache = await stat(join(cwd, 'node_modules', '.cache', 'agent-quality-gate', 'fallow'));
    expect(cache.isDirectory()).toBe(true);
  });

  it('writes the generated Fallow config during verify and removes it afterward', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');

    const first = await runVerify(cwd);
    const fallowDir = join(cwd, '.aqg', 'fallow');
    const oxlintDir = join(cwd, '.aqg', 'oxlint');

    expect(first.exitCode).toBe(0);
    expect(existsSync(join(cwd, '.fallowrc.json'))).toBe(false);
    expect(existsSync(fallowDir)).toBe(false);
    expect(existsSync(oxlintDir)).toBe(false);

    const second = await runVerify(cwd);

    expect(second.exitCode).toBe(0);
    expect(existsSync(fallowDir)).toBe(false);
    expect(existsSync(oxlintDir)).toBe(false);
  });

  it('checks nested generated-directory names with Oxlint', async () => {
    const cwd = await createTypeScriptProject('export-value/src/index.ts');
    for (const directory of ['build', 'dist', 'tmp']) {
      await mkdir(join(cwd, 'src', directory), { recursive: true });
      await writeTextFile(join(cwd, 'src', directory, 'invalid.ts'), 'const = ;\n');
    }

    const result = await runVerify(cwd);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    for (const directory of ['build', 'dist', 'tmp']) {
      expect(output).toContain(join('src', directory, 'invalid.ts'));
    }
  });

  it('runs against an explicit project root with packaged policy', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const oxlintConfig = await readFixture(
      EXECUTE_VERIFY_FIXTURES_ROOT,
      'oxlint-config-off-debugger/oxlint.config.ts',
    );
    await writeTextFile(join(cwd, 'oxlint.config.ts'), oxlintConfig);

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
    expect(existsSync(join(cwd, '.fallowrc.json'))).toBe(false);
  });

  it('captures tool diagnostics without reading workspace tool configs', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    const oxlintConfig = await readFixture(
      EXECUTE_VERIFY_FIXTURES_ROOT,
      'oxlint-config-off-debugger/oxlint.config.ts',
    );
    await writeTextFile(join(cwd, 'oxlint.config.ts'), oxlintConfig);

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
    });
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toContain('eslint(no-debugger)');
  });
});
