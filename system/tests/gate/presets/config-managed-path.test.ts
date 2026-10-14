import { copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { preparePresetChecks } from '#system/gate/run/preset-preflight.ts';
import { resolvePresetContract } from '#system/presets/preset-catalog.ts';
import { writeTextFile } from '#system/process/files/files.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const CUSTOM_ENVIRONMENT_PATH = 'src/server/config/environment.ts';
const { tempDirectories: temporaryDirectories } = useTrackedTempDirectories();

test('config preset relocates its managed environment file', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'config-managed-path-'));
  temporaryDirectories.push(projectRoot);
  await writeTextFile(
    join(projectRoot, 'package.json'),
    `${JSON.stringify({ dependencies: { valibot: '1.5.0' } }, null, 2)}\n`,
  );

  const contract = await resolvePresetContract(['config']);
  const environmentFile = contract.files.find((file) => file.presetName === 'config');
  expect(environmentFile).toBeDefined();
  if (environmentFile === undefined) {
    return;
  }
  const destination = join(projectRoot, CUSTOM_ENVIRONMENT_PATH);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(environmentFile.absoluteSource, destination);

  const prepared = await preparePresetChecks(
    projectRoot,
    ['config'],
    { config: { environmentPath: CUSTOM_ENVIRONMENT_PATH } },
    true,
  );
  expect('exitCode' in prepared).toBe(false);
  if ('exitCode' in prepared) {
    return;
  }
  expect(prepared.contract.files.find((file) => file.presetName === 'config')?.destination).toBe(
    CUSTOM_ENVIRONMENT_PATH,
  );
  expect(prepared.managedFilePaths.has(CUSTOM_ENVIRONMENT_PATH)).toBe(true);
  expect(prepared.managedFilePaths.has('system/config/environment.ts')).toBe(false);
});
