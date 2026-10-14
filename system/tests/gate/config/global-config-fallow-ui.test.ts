import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'bun:test';
import { YAML } from 'bun';

import { readGlobalQualityGateConfig } from '#system/config/global-config/global-config.ts';
import { writeTextFile } from '#system/process/files/files.ts';
import { intrinsicUiOverlayMatcher } from '#system/tests/support/config-fixtures.ts';

let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

it('preserves Fallow runtime UI interaction overlays', async () => {
  directory = await mkdtemp(join(tmpdir(), 'global-config-fallow-ui-'));
  const configPath = join(directory, 'config.yaml');
  await writeTextFile(
    configPath,
    YAML.stringify({
      projects: [
        {
          root: directory,
          entries: ['src/index.ts'],
          intrinsicInteractions: [
            {
              elements: ['canvas'],
              property: 'onDraw',
              classification: 'interaction',
              kind: 'pointer',
            },
          ],
          lifecycleCallbacks: ['onReady'],
          actionCompatibility: { pointer: ['dragTo', 'draw'] },
        },
      ],
    }),
  );

  expect((await readGlobalQualityGateConfig(configPath)).projects[0]).toMatchObject(
    intrinsicUiOverlayMatcher,
  );
});
