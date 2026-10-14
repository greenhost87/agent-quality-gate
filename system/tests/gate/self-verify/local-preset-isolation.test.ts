import { mkdir, rename, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { rejectCrossPresetImports } from '#system/scripts/self-verify/preset-isolation.ts';
import { materializeFixture } from '#system/tests/support/materialize-fixture.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const FIXTURES_ROOT = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures',
  'local-preset-isolation',
);
const { tempDirectories } = useTrackedTempDirectories();

async function inspectFixture(caseName: string) {
  const root = await materializeFixture(
    FIXTURES_ROOT,
    'aqg-preset-isolation-',
    caseName,
    tempDirectories,
  );
  return rejectCrossPresetImports(root);
}

async function materializeValidFixture(): Promise<string> {
  return materializeFixture(FIXTURES_ROOT, 'aqg-preset-isolation-', 'valid', tempDirectories);
}

async function expectAllowedFixture(caseName: string, expectNoDiagnostics = false): Promise<void> {
  const result = await inspectFixture(caseName);
  expect(result.exitCode).toBe(0);
  if (expectNoDiagnostics) expect(result.stderr).toBe('');
}

async function systemViolationFixture(symlinkPreset: boolean): Promise<string> {
  const root = await materializeValidFixture();
  let importerRoot = join(root, 'presets', 'alpha');
  if (symlinkPreset) {
    importerRoot = join(root, 'external-preset');
    await rename(join(root, 'presets', 'alpha'), importerRoot);
    await symlink(importerRoot, join(root, 'presets', 'alpha'));
  }
  await mkdir(join(root, 'system'), { recursive: true });
  await writeFile(join(root, 'system', 'internal.ts'), 'export const internal = true;');
  await writeFile(
    join(importerRoot, 'check.ts'),
    "import { internal } from '../../system/internal.js';",
  );
  return root;
}

function expectSystemImportViolation(root: string): void {
  const result = rejectCrossPresetImports(root);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('presets/alpha/check.ts');
  expect(result.stderr).toContain('system/internal.ts');
}

describe('local preset isolation', () => {
  it('rejects relative imports from one preset into another', async () => {
    const result = await inspectFixture('invalid');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('preset-isolation:');
    expect(result.stderr).toContain('presets/alpha/check.ts');
    expect(result.stderr).toContain('presets/beta/helper.ts');
  });

  it('allows imports within a preset', async () => {
    await expectAllowedFixture('valid', true);
  });

  it('rejects a local preset importing system code', async () => {
    const root = await systemViolationFixture(false);
    expectSystemImportViolation(root);
  });

  it('rejects a symlink preset importing system code', async () => {
    const root = await systemViolationFixture(true);
    expectSystemImportViolation(root);
  });

  it('allows only exact AQG public imports and third-party packages', async () => {
    const root = await materializeValidFixture();
    await writeFile(
      join(root, 'presets', 'alpha', 'check.ts'),
      "import 'agent-quality-gate/shared/verify'; import 'agent-quality-gate/shared/oxlint'; import 'agent-quality-gate/testing/oxlint'; import 'agent-quality-gate/preset-database'; import { other } from 'some-third-party-package'; import { legacy } from 'agent-quality-gate/verify'; import { internal } from 'agent-quality-gate/shared/private';",
    );
    const result = rejectCrossPresetImports(root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('agent-quality-gate/verify');
    expect(result.stderr).toContain('agent-quality-gate/shared/private');
    expect(result.stderr).not.toContain('agent-quality-gate/shared/verify');
    expect(result.stderr).not.toContain('agent-quality-gate/shared/oxlint');
    expect(result.stderr).not.toContain('agent-quality-gate/testing/oxlint');
    expect(result.stderr).toContain('agent-quality-gate/preset-database');
    expect(result.stderr).not.toContain('some-third-party-package');
  });

  it('ignores quality fixtures when scanning for cross-preset imports', async () => {
    await expectAllowedFixture('fixtures-only');
  });
});
