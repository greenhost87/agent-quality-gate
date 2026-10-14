import { existsSync } from 'node:fs';
import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { writeTextFile } from '#system/process/files/files.ts';

import { describe, expect, it } from 'bun:test';

import { packagedAssetsDirectory } from '#system/config/packaged-assets/packaged-assets.ts';
import { readOxlintConfig } from '#system/config/verify-config-files/verify-config-files.ts';
import { isCustomFallowExecutable } from '#system/gate/run/verify-tool-run.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  expectVerifyFailureText,
  expectVerifySuccessText,
} from '#system/tests/support/verify-assertions.ts';
import { readFixture } from '#system/tests/support/fixture-files.ts';
import {
  EXECUTE_VERIFY_FIXTURES_ROOT,
  executeVerifySrcIndex,
  runCleanProjectVerify,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';

import { verifyPresentedText } from '#system/tests/support/verify-result-text.ts';
import { cacheRecordingFallowRunner, stubVerifyTools } from './verify-phases-helpers.js';

type NestedFileScenario = {
  directories: string[];
  filename: string;
  source: string;
  requiredDiagnostic?: string;
};

async function expectNestedFilesRejected(scenario: NestedFileScenario): Promise<void> {
  const cwd = await createTypeScriptProject('export-value/src/index.ts');
  for (const directory of scenario.directories) {
    const root = join(cwd, 'src', directory);
    await mkdir(root, { recursive: true });
    await writeTextFile(join(root, scenario.filename), scenario.source);
  }
  const result = await runVerify(cwd);
  const output = verifyPresentedText(result);
  expect(result.exitCode).toBe(1);
  if (scenario.requiredDiagnostic !== undefined) {
    expect(output).toContain(scenario.requiredDiagnostic);
  }
  for (const directory of scenario.directories) {
    expect(output).toContain(join('src', directory, scenario.filename));
  }
}

async function createRootDotFileProject(): Promise<string> {
  const cwd = await createTypeScriptProject('export-value/src/index.ts');
  await writeTextFile(join(cwd, '.invalid.ts'), 'const = ;\n');
  return cwd;
}

async function installWorkspaceOxlintConfig(cwd: string): Promise<void> {
  const config = await readFixture(
    EXECUTE_VERIFY_FIXTURES_ROOT,
    'oxlint-config-off-debugger/oxlint.config.ts',
  );
  await writeTextFile(join(cwd, 'oxlint.config.ts'), config);
}

const IGNORED_PATHS = (readOxlintConfig(packagedAssetsDirectory()).ignorePatterns ?? []).map(
  (pattern) => (pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern),
);

function ignoredDirectoryPaths(): string[] {
  return IGNORED_PATHS.filter((path) => {
    if (path.startsWith('!')) return false;
    if (path === '.*') {
      return true;
    }
    const name = path.split('/').at(-1) ?? path;
    return name.startsWith('.') || !name.includes('.');
  });
}

useIsolatedAgentQualityGateHome();
const projects = useExecuteVerifyProjects();
const { createTypeScriptProject, makeTempDirectory, runVerify, initializeGitRepository } = projects;

describe('verify', () => {
  async function expectDotCheckoutIgnored(generatedSource: string): Promise<void> {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const checkout = join(cwd, '.worktrees', 'feature');
    await mkdir(checkout, { recursive: true });
    await writeTextFile(join(checkout, 'generated.ts'), generatedSource);

    const result = await runVerify(cwd);

    expect(result.exitCode).toBe(0);
  }
  it('requires declared project dependencies to be installed before analysis', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    await writeTextFile(
      join(cwd, 'package.json'),
      `${JSON.stringify(
        {
          name: 'missing-install-fixture',
          private: true,
          type: 'module',
          dependencies: { next: '16.0.0' },
          devDependencies: { typescript: '7.0.0' },
          optionalDependencies: { optional: '1.0.0' },
        },
        null,
        2,
      )}\n`,
    );

    const result = await runVerify(cwd);
    expectVerifyFailureText(
      result,
      'project dependencies are not installed',
      'missing from node_modules: next, typescript',
      'run `bun install`',
    );
    expect(verifyPresentedText(result)).not.toContain('optional');
  });

  it('runs checks even when only non-lintable files are dirty in a Git repository', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    await initializeGitRepository(cwd);
    await writeTextFile(join(cwd, 'README.md'), '# Documentation\n');

    const result = await runVerify(cwd);

    expectVerifyFailureText(result, 'no-debugger');
  });

  it('enforces locked rules despite ESLint disable directives', async () => {
    const cwd = await createTypeScriptProject('locked-rules-directive/src/index.ts');

    const result = await runVerify(cwd);
    expectVerifyFailureText(result, 'no-debugger');
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
    await expectDotCheckoutIgnored(
      await readFixture(EXECUTE_VERIFY_FIXTURES_ROOT, 'dot-checkout-generated/generated.ts'),
    );
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

    const result = await executeVerifySrcIndex(cwd, { ignorePatterns: ['src/testdata/**'] });

    expect(result.exitCode).toBe(0);
  });

  it('ignores Oxlint issues in arbitrary root dot directories', async () => {
    await expectDotCheckoutIgnored('const = ;\n');
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
        expect(verifyPresentedText(result)).toContain('unused.ts');
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
    const cwd = await createRootDotFileProject();

    const result = await runVerify(cwd);
    expectVerifyFailureText(result, '.invalid.ts');
  });

  it('checks nested dot directories with Oxlint', async () => {
    const cwd = await createTypeScriptProject('export-value/src/index.ts');
    const nestedDirectory = join(cwd, 'src', '.hidden');
    await mkdir(nestedDirectory);
    await writeTextFile(join(nestedDirectory, 'invalid.ts'), 'const = ;\n');

    const result = await runVerify(cwd);
    expectVerifyFailureText(result, join('src', '.hidden', 'invalid.ts'));
  });

  it('treats exports from configured entries as externally consumed', async () => {
    const cwd = await createTypeScriptProject('export-public-value/src/index.ts');

    const result = await runVerify(cwd);

    expectVerifySuccessText(result);
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

    const outputLines = verifyPresentedText(result).split('\n');
    expectVerifyFailureText(result, 'unused-class-member');
    expect(verifyPresentedText(result)).toContain('workflows.dao.ts');
    expect(outputLines.some((line) => line.startsWith('vital-signs:'))).toBe(false);
    expect(outputLines.some((line) => line.startsWith('file-score:'))).toBe(false);
  });

  it('keeps Fallow-ignored files covered by Oxlint', async () => {
    const cwd = await createTypeScriptProject('export-value/src/index.ts');
    await mkdir(join(cwd, 'migrations'));
    await writeTextFile(join(cwd, 'migrations', '001-invalid.ts'), 'const = ;\n');

    const result = await runVerify(cwd);
    expectVerifyFailureText(result, '001-invalid.ts');
  });

  it('checks configured root paths when nested under source', async () => {
    const nestedIndexSource = await readFixture(
      EXECUTE_VERIFY_FIXTURES_ROOT,
      'nested-src-index/index.ts',
    );
    await expectNestedFilesRejected({
      directories: IGNORED_PATHS.map((path) => (path === '.*' ? '.hidden' : path)),
      filename: 'index.ts',
      source: nestedIndexSource,
      requiredDiagnostic: 'aqg/no-oxlint-disable-directives',
    });
  });

  it('points each Fallow launch at its .aqg/cache/fallow cache', async () => {
    const cacheEnvs: string[] = [];
    const configCacheDirs: Array<string | undefined> = [];

    const { cwd, result } = await runCleanProjectVerify(
      projects,
      stubVerifyTools({ fallow: cacheRecordingFallowRunner(cacheEnvs, configCacheDirs) }),
    );

    expect(result.exitCode).toBe(0);
    // First launch on the `combined` cache, dupes launch on the `dupes` cache.
    expect(cacheEnvs).toEqual([
      join(cwd, '.aqg', 'cache', 'fallow', 'combined'),
      join(cwd, '.aqg', 'cache', 'fallow', 'dupes'),
    ]);
    // The custom fork takes the directory via `cache.dir`; the packaged
    // binary ignores that key and relies on `FALLOW_CACHE_DIR` instead.
    expect(configCacheDirs).toEqual(
      isCustomFallowExecutable()
        ? [
            join(cwd, '.aqg', 'cache', 'fallow', 'combined'),
            join(cwd, '.aqg', 'cache', 'fallow', 'dupes'),
          ]
        : [undefined, undefined],
    );
  });

  it('removes ephemeral Oxlint and Fallow configs after verify', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');

    const result = await runVerify(cwd);
    const fallowConfig = join(cwd, '.aqg', 'fallow', 'verify.json');
    const oxlintConfig = join(cwd, '.aqg', 'oxlint', 'verify.config.ts');

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(cwd, '.fallowrc.json'))).toBe(false);
    expect(existsSync(fallowConfig)).toBe(false);
    expect(existsSync(oxlintConfig)).toBe(false);
  });

  it('checks nested generated-directory names with Oxlint', async () => {
    await expectNestedFilesRejected({
      directories: ['build', 'dist', 'tmp'],
      filename: 'invalid.ts',
      source: 'const = ;\n',
    });
  });

  it('runs against an explicit project root with packaged policy', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    await installWorkspaceOxlintConfig(cwd);

    const result = await executeVerifySrcIndex(cwd);

    expectVerifySuccessText(result);
    expect(existsSync(join(cwd, '.fallowrc.json'))).toBe(false);
  });

  it('captures tool diagnostics without reading workspace tool configs', async () => {
    const cwd = await createTypeScriptProject('debugger-with-export/src/index.ts');
    await installWorkspaceOxlintConfig(cwd);

    const result = await executeVerifySrcIndex(cwd);
    expectVerifyFailureText(result, 'no-debugger');
  });
});
