import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  homeInstalledPresetRoot,
  homePresetsDirectory,
} from '../../config/agent-quality-gate-home/agent-quality-gate-home.js';
import { executeVerify } from '../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];

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
    expect(result.stderr).toContain('must export preflight and/or runToolChecks');
  });
});
