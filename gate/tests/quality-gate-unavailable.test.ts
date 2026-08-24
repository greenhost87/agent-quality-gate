import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile, writeTextFile } from '../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';
import { readFixture } from '../../tests/support/fixture-files.js';
import {
  executeQualityGateForCwd,
  followUpForSettledResult,
  toolOutput,
} from '../quality-gate-run/quality-gate-run.js';

useIsolatedAgentQualityGateHome();

const tempDirectories: string[] = [];
const FIXTURES_ROOT = join(import.meta.dir, '..', '.quality-fixtures', 'quality-gate-unavailable');

async function makeTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeGlobalConfig(directory: string, value: object | string): Promise<string> {
  const configPath = join(directory, 'config.yaml');
  const body = typeof value === 'string' ? value : YAML.stringify(value, null, 2);
  await writeTextFile(configPath, body);
  return configPath;
}

async function createMinimalProject(): Promise<string> {
  const source = await readFixture(FIXTURES_ROOT, 'clean-function', 'src/index.ts');
  const cwd = await makeTempDirectory('aqg-unavailable-project-');
  await mkdir(join(cwd, 'src'));
  await writeTextFile(
    join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'aqg-unavailable', private: true, type: 'module' }, null, 2)}\n`,
  );
  await writeTextFile(join(cwd, 'src', 'index.ts'), source);
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('quality gate internal unavailability', () => {
  it('logs corrupt global config and keeps agent output free of internals', async () => {
    const cwd = await createMinimalProject();
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('aqg-unavailable-config-'),
      'projects: true\n',
    );

    const run = await executeQualityGateForCwd(cwd, { configPath });
    expect(run.kind).toBe('unavailable');
    if (run.kind !== 'unavailable') {
      return;
    }
    expect(existsSync(run.logPath)).toBe(true);
    const log = await readTextFile(run.logPath);
    expect(log).toContain('projects must be an array');

    const text = await toolOutput(run);
    expect(text.toLowerCase()).toContain('unavailable');
    expect(text).not.toContain(configPath);
    expect(text).not.toContain('projects must be an array');
    expect(await followUpForSettledResult(run)).toBeUndefined();
  });

  it('logs unknown preset failures without agent-facing details', async () => {
    const cwd = await createMinimalProject();
    const configPath = await writeGlobalConfig(await makeTempDirectory('aqg-unavailable-preset-'), {
      projects: [{ root: cwd, entries: ['src/index.ts'], presets: ['not-a-real-preset'] }],
    });

    const run = await executeQualityGateForCwd(cwd, { configPath });
    expect(run.kind).toBe('unavailable');
    if (run.kind !== 'unavailable') {
      return;
    }
    expect(existsSync(run.logPath)).toBe(true);
    const log = await readTextFile(run.logPath);
    expect(log).toContain('unknown preset');

    const text = await toolOutput(run);
    expect(text).not.toContain('unknown preset');
    expect(text).not.toContain('not-a-real-preset');
    expect(await followUpForSettledResult(run)).toBeUndefined();
  });
});
