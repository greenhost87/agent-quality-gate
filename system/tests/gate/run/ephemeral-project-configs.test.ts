import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { removeEphemeralProjectConfigs } from '#system/gate/run/ephemeral-project-configs.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const { makeTempDirectory } = useTrackedTempDirectories();

async function writeEphemeralScaffold(): Promise<{
  projectRoot: string;
  oxlintConfigPath: string;
  fallowConfigPath: string;
  oxlintDir: string;
  fallowDir: string;
}> {
  const projectRoot = await makeTempDirectory('aqg-ephemeral-project-');
  const oxlintDir = join(projectRoot, '.aqg', 'oxlint');
  const fallowDir = join(projectRoot, '.aqg', 'fallow');
  const oxlintConfigPath = join(oxlintDir, 'verify.config.ts');
  const fallowConfigPath = join(fallowDir, 'verify.json');
  await mkdir(oxlintDir, { recursive: true });
  await mkdir(fallowDir, { recursive: true });
  await writeFile(oxlintConfigPath, 'export default {};\n');
  await writeFile(fallowConfigPath, '{}\n');
  return { projectRoot, oxlintConfigPath, fallowConfigPath, oxlintDir, fallowDir };
}

describe('removeEphemeralProjectConfigs', () => {
  it('removes verify configs and empties ephemeral directories', async () => {
    const { projectRoot, oxlintConfigPath, fallowConfigPath, oxlintDir, fallowDir } =
      await writeEphemeralScaffold();

    await removeEphemeralProjectConfigs(projectRoot, {
      oxlintConfigPath,
      fallowConfigPaths: [fallowConfigPath],
    });

    expect(existsSync(oxlintConfigPath)).toBe(false);
    expect(existsSync(fallowConfigPath)).toBe(false);
    expect(existsSync(oxlintDir)).toBe(false);
    expect(existsSync(fallowDir)).toBe(false);
    expect(existsSync(join(projectRoot, '.aqg'))).toBe(true);
  });

  it('removes stale preset scratch files and leaves other .aqg artifacts', async () => {
    const { projectRoot, oxlintConfigPath, fallowConfigPath, oxlintDir, fallowDir } =
      await writeEphemeralScaffold();
    const artifactPath = join(projectRoot, '.aqg', 'parse_example.ts');
    const staleOxlintPath = join(oxlintDir, '19b7-mtbxqp7i-ed29e8d5.config.ts');
    const staleFallowPath = join(fallowDir, 'sample-check-100x-mtbwnqf3-cac9ef5d.json');
    const staleFallowOutputPath = join(fallowDir, 'sample-check-100x-mtbwnqf3-7725fb5c.out.json');
    await writeFile(artifactPath, 'export {};\n');
    await writeFile(staleOxlintPath, 'export default {};\n');
    await writeFile(staleFallowPath, '{}\n');
    await writeFile(staleFallowOutputPath, '{}\n');

    await removeEphemeralProjectConfigs(projectRoot, {
      oxlintConfigPath,
      fallowConfigPaths: [fallowConfigPath],
    });

    expect(existsSync(artifactPath)).toBe(true);
    expect(existsSync(oxlintDir)).toBe(false);
    expect(existsSync(fallowDir)).toBe(false);
  });
});
