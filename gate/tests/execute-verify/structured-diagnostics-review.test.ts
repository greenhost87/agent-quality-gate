import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';

import { checkResultFromFallowHygieneToolRun } from '../../execute-verify/fallow-json-diagnostics.js';
import { fallowExecutablePath } from '../../execute-verify/verify-tool-run.js';
import type { ToolRunResult } from '../../execute-verify/execute-verify.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function tempCopy(fixtureRelative: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'aqg-structured-diag-'));
  tempDirectories.push(root);
  await cp(join(import.meta.dir, '../../.quality-fixtures', fixtureRelative), root, {
    recursive: true,
  });
  return root;
}

function runRealFallowHygiene(projectRoot: string): ToolRunResult {
  const result = spawnSync(
    fallowExecutablePath(),
    [
      '--skip',
      'health',
      '--fail-on-issues',
      '--format',
      'json',
      '--quiet',
      '--root',
      projectRoot,
      '--config',
      join(projectRoot, 'fallow.json'),
    ],
    { encoding: 'utf8' },
  );
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('structured diagnostics review regressions R1', () => {
  it('R1: real Fallow unlisted dependency remains blocking', async () => {
    const root = await tempCopy('fallow-unlisted-dependency');
    const raw = runRealFallowHygiene(root);
    expect(raw.stdout).toContain('"unlisted_dependencies"');
    expect(raw.stdout).toContain('"lodash"');
    const result = checkResultFromFallowHygieneToolRun(raw);
    expect(result.exitCode).not.toBe(0);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.ruleId === 'unlisted-dependency'),
    ).toBe(true);
    expect(result.diagnostics[0]?.message).toBe('lodash');
    expect(result.diagnostics[0]?.location?.path).toBe('src/index.ts');
  });

  it('R1: real Fallow duplicate exports remain blocking hygiene findings', async () => {
    const root = await tempCopy('fallow-duplicate-exports');
    const raw = runRealFallowHygiene(root);
    expect(raw.stdout).toContain('"duplicate_exports"');
    expect(raw.stdout).toContain('"Button"');
    const result = checkResultFromFallowHygieneToolRun(raw);
    expect(result.exitCode).not.toBe(0);
    expect(result.diagnostics.some((diagnostic) => diagnostic.ruleId === 'duplicate-export')).toBe(
      true,
    );
    expect(result.diagnostics[0]?.message).toBe('Button');
    expect(result.diagnostics[0]?.related?.length).toBeGreaterThan(0);
  });

  it('R1: synthetic missing hygiene categories stay mapped', () => {
    const result = checkResultFromFallowHygieneToolRun({
      exitCode: 1,
      stdout: JSON.stringify({
        kind: 'combined',
        check: {
          total_issues: 5,
          unused_dev_dependencies: [{ package_name: 'vitest', path: 'package.json', line: 1 }],
          unused_optional_dependencies: [
            { package_name: 'fsevents', path: 'package.json', line: 1 },
          ],
          type_only_dependencies: [{ package_name: 'types-only', path: 'package.json', line: 2 }],
          test_only_dependencies: [{ package_name: 'test-lib', path: 'package.json', line: 3 }],
          unlisted_dependencies: [
            {
              package_name: 'missing-pkg',
              imported_from: [{ path: 'src/a.ts', line: 1, col: 0 }],
            },
          ],
        },
        dupes: { clone_groups: [] },
      }),
      stderr: '',
    });
    expect(result.exitCode).toBe(1);
    const rules = new Set(result.diagnostics.map((diagnostic) => diagnostic.ruleId));
    expect(rules.has('unused-dev-dependency')).toBe(true);
    expect(rules.has('unused-optional-dependency')).toBe(true);
    expect(rules.has('type-only-dependency')).toBe(true);
    expect(rules.has('test-only-dependency')).toBe(true);
    expect(rules.has('unlisted-dependency')).toBe(true);
  });
});
