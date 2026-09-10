import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  homeInstalledPresetRoot,
  homePresetsDirectory,
} from '../../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { executeVerify } from '../../execute-verify/execute-verify.js';
import { streamResultFromVerifyResult } from '../../public-verify/verify-streams.js';
import { readFixture } from '../../../tests/support/fixture-files.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '../..', '.quality-fixtures', 'preset-check-module');

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('preset check module loading', () => {
  it('rejects a check module that exports neither preflight nor runToolChecks', async () => {
    const project = await makeTempDirectory('aqg-empty-check-project-');
    const presetName = 'empty-check';
    const presetRoot = homeInstalledPresetRoot(presetName);
    await mkdir(homePresetsDirectory(), { recursive: true });
    await mkdir(presetRoot, { recursive: true });
    await writeTextFile(
      join(presetRoot, 'manifest.json'),
      `${JSON.stringify(
        {
          name: presetName,
          requires: [],
          files: [],
          dependencies: [],
          oxlint: { nativePlugins: [], plugins: [], rules: {}, overrides: [] },
        },
        null,
        2,
      )}\n`,
    );
    await writeTextFile(join(presetRoot, 'check.ts'), 'export const unused = 1;\n');
    await mkdir(join(project, 'src'), { recursive: true });
    await writeTextFile(join(project, 'src/index.ts'), 'export const value = 1;\n');

    const result = await executeVerify({
      projectRoot: project,
      entries: ['src/index.ts'],
      presets: [presetName],
    });

    expect(result.exitCode).toBe(1);
    expect(streamResultFromVerifyResult(result).stderr).toContain(
      'must export preflight and/or runToolChecks',
    );
  });

  it('passes structured hints from a home-installed preset through executeVerify', async () => {
    const project = await makeTempDirectory('aqg-hint-check-project-');
    const presetName = 'optional-alpha';
    const presetRoot = homeInstalledPresetRoot(presetName);
    await mkdir(homePresetsDirectory(), { recursive: true });
    await mkdir(presetRoot, { recursive: true });
    await writeTextFile(
      join(presetRoot, 'manifest.json'),
      `${JSON.stringify(
        {
          name: presetName,
          requires: [],
          files: [],
          dependencies: [],
          oxlint: { nativePlugins: [], plugins: [], rules: {}, overrides: [] },
        },
        null,
        2,
      )}\n`,
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
    await mkdir(join(project, 'src'), { recursive: true });
    await writeTextFile(join(project, 'src/index.ts'), 'export const value = 1;\n');

    const result = await executeVerify({
      projectRoot: project,
      entries: ['src/index.ts'],
      presets: [presetName],
    });

    expect(result.exitCode).toBe(1);
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
