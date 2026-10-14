import { mkdir } from 'node:fs/promises';

import { join } from 'node:path';
import { writeTextFile } from '#system/process/files/files.ts';

import { describe, expect, it } from 'bun:test';

import {
  homeInstalledPresetRoot,
  homePresetsDirectory,
} from '#system/config/agent-quality-gate-home.ts';
import { executeVerify } from '#system/gate/run/execute-verify.ts';
import { streamResultFromVerifyResult } from '#system/gate/public-verify/verify-streams.ts';
import { readFixture } from '#system/tests/support/fixture-files.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';
import { writePresetManifest } from '#system/tests/support/preset-fixtures.ts';

useIsolatedAgentQualityGateHome();

const { makeTempDirectory } = useTrackedTempDirectories();
const FIXTURES_ROOT = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures',
  'preset-check-module',
);

async function createHomePreset(project: string, presetName: string): Promise<string> {
  const presetRoot = homeInstalledPresetRoot(presetName);
  await mkdir(homePresetsDirectory(), { recursive: true });
  await mkdir(presetRoot, { recursive: true });
  await writePresetManifest(presetRoot, presetName);
  await writeEntryProject(project);
  return presetRoot;
}

async function writeEntryProject(project: string): Promise<void> {
  await mkdir(join(project, 'src'), { recursive: true });
  await writeTextFile(join(project, 'src/index.ts'), 'export const value = 1;\n');
}

function presetRequest(project: string, presetName: string) {
  return { projectRoot: project, entries: ['src/index.ts'], presets: [presetName] };
}

function expectFailedExecution(result: Awaited<ReturnType<typeof executeVerify>>): void {
  expect(result.exitCode).toBe(1);
}

async function createHomePresetProject(projectPrefix: string, presetName: string) {
  const project = await makeTempDirectory(projectPrefix);
  const presetRoot = await createHomePreset(project, presetName);
  return { project, presetRoot };
}

describe('preset check module loading', () => {
  it('rejects a check module that exports neither preflight nor runToolChecks', async () => {
    const presetName = 'empty-check';
    const { project, presetRoot } = await createHomePresetProject(
      'aqg-empty-check-project-',
      presetName,
    );
    await writeTextFile(join(presetRoot, 'check.ts'), 'export const unused = 1;\n');

    const result = await executeVerify(presetRequest(project, presetName));

    expectFailedExecution(result);
    expect(streamResultFromVerifyResult(result).stderr).toContain(
      'must export preflight and/or runToolChecks',
    );
  });

  it('passes structured hints from a home-installed preset through executeVerify', async () => {
    const presetName = 'optional-alpha';
    const { project, presetRoot } = await createHomePresetProject(
      'aqg-hint-check-project-',
      presetName,
    );
    const hintBody = await readFixture(FIXTURES_ROOT, 'sample-check-hint.md');
    await writeTextFile(
      join(presetRoot, 'check.ts'),
      [
        'export async function runToolChecks() {',
        '  return [',
        '    {',
        '      exitCode: 1,',
        '      diagnostics: [',
        "        { source: 'sample', ruleId: 'sample-check', severity: 'error', message: 'helper', location: { path: 'src/helper.ts' }, groupHeader: 'sample-check' },",
        '      ],',
        '      hints: [',
        `        { kind: 'document', id: 'sample-check', body: ${JSON.stringify(hintBody)} },`,
        "        { kind: 'builtin', id: 'avoid-micro-splits' },",
        '      ],',
        '    },',
        '  ];',
        '}',
        '',
      ].join('\n'),
    );

    const result = await executeVerify(presetRequest(project, presetName));

    expectFailedExecution(result);
    expect(result.diagnostics.some((diagnostic) => diagnostic.ruleId === 'sample-check')).toBe(
      true,
    );
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.location?.path === 'src/helper.ts'),
    ).toBe(true);
    expect(result.hints).toEqual([
      {
        kind: 'document',
        id: 'sample-check',
        body: hintBody,
        owner: 'optional-alpha',
      },
      { kind: 'builtin', id: 'avoid-micro-splits' },
    ]);
  });
});
