import { mkdir } from 'node:fs/promises';

import { join } from 'node:path';
import { writeTextFile } from '#system/process/files/files.ts';

import { describe, expect, it } from 'bun:test';
import { YAML } from 'bun';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import { readFixture } from '#system/tests/support/fixture-files.ts';
import {
  executeQualityGateForCwd,
  followUpForSettledResult,
  toolOutput,
} from '#system/gate/quality-gate-run/quality-gate-run.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

useIsolatedAgentQualityGateHome();

const { makeTempDirectory } = useTrackedTempDirectories();
const FIXTURES_ROOT = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures',
  'quality-gate-unavailable',
);

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

describe('quality gate internal unavailability', () => {
  it('treats invalid global config shape as unconfigured instead of unavailable', async () => {
    const cwd = await createMinimalProject();
    const configPath = await writeGlobalConfig(
      await makeTempDirectory('aqg-unavailable-config-'),
      'projects: true\n',
    );

    const run = await executeQualityGateForCwd(cwd, { configPath });
    expect(run.kind).toBe('skipped');
    if (run.kind !== 'skipped') {
      return;
    }
    expect(run.message).toContain('No configured agent-quality-gate project');

    const text = await toolOutput(run);
    expect(text).toContain('No configured agent-quality-gate project');
    expect(text.toLowerCase()).not.toContain('unavailable');
    expect(await followUpForSettledResult(run)).toBeUndefined();
  });

  it('drops unknown presets and still runs verify', async () => {
    const cwd = await createMinimalProject();
    const configPath = await writeGlobalConfig(await makeTempDirectory('aqg-unavailable-preset-'), {
      projects: [{ root: cwd, entries: ['src/index.ts'], presets: ['not-a-real-preset'] }],
    });

    const run = await executeQualityGateForCwd(cwd, { configPath });
    expect(run.kind).toBe('ran');
    if (run.kind !== 'ran') {
      return;
    }
    const text = await toolOutput(run);
    expect(text.toLowerCase()).not.toContain('unavailable');
    expect(text).not.toContain('unknown preset');
    expect(await followUpForSettledResult(run)).toBeUndefined();
  });
});
