import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { removeEphemeralProjectConfigs } from '../../../config/agent-quality-gate-home/agent-quality-gate-home.js';

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

describe('removeEphemeralProjectConfigs', () => {
  it('removes per-run config files and empty ephemeral directories', async () => {
    const projectRoot = await makeTempDirectory('aqg-ephemeral-project-');
    const oxlintDir = join(projectRoot, '.aqg', 'oxlint');
    const fallowDir = join(projectRoot, '.aqg', 'fallow');
    const oxlintConfigPath = join(oxlintDir, 'run-a.config.ts');
    const fallowConfigPath = join(fallowDir, 'run-a.json');
    await mkdir(oxlintDir, { recursive: true });
    await mkdir(fallowDir, { recursive: true });
    await writeFile(oxlintConfigPath, 'export default {};\n');
    await writeFile(fallowConfigPath, '{}\n');

    await removeEphemeralProjectConfigs({
      oxlintConfigPath,
      fallowConfigPaths: [fallowConfigPath],
    });

    expect(existsSync(oxlintConfigPath)).toBe(false);
    expect(existsSync(fallowConfigPath)).toBe(false);
    expect(existsSync(oxlintDir)).toBe(false);
    expect(existsSync(fallowDir)).toBe(false);
    expect(existsSync(join(projectRoot, '.aqg'))).toBe(true);
  });

  it('leaves other .aqg artifacts and concurrent run files untouched', async () => {
    const projectRoot = await makeTempDirectory('aqg-ephemeral-project-');
    const artifactPath = join(projectRoot, '.aqg', 'parse_example.ts');
    const oxlintDir = join(projectRoot, '.aqg', 'oxlint');
    const fallowDir = join(projectRoot, '.aqg', 'fallow');
    const ownOxlintPath = join(oxlintDir, 'run-a.config.ts');
    const ownFallowPath = join(fallowDir, 'run-a.json');
    const otherOxlintPath = join(oxlintDir, 'run-b.config.ts');
    const otherFallowPath = join(fallowDir, 'run-b.json');
    await mkdir(oxlintDir, { recursive: true });
    await mkdir(fallowDir, { recursive: true });
    await writeFile(artifactPath, 'export {};\n');
    await writeFile(ownOxlintPath, 'export default {};\n');
    await writeFile(otherOxlintPath, 'export default {};\n');
    await writeFile(ownFallowPath, '{}\n');
    await writeFile(otherFallowPath, '{}\n');

    await removeEphemeralProjectConfigs({
      oxlintConfigPath: ownOxlintPath,
      fallowConfigPaths: [ownFallowPath],
    });

    expect(existsSync(artifactPath)).toBe(true);
    expect(existsSync(ownOxlintPath)).toBe(false);
    expect(existsSync(ownFallowPath)).toBe(false);
    expect(existsSync(otherOxlintPath)).toBe(true);
    expect(existsSync(otherFallowPath)).toBe(true);
    expect((await readdir(oxlintDir)).sort()).toEqual(['run-b.config.ts']);
    expect((await readdir(fallowDir)).sort()).toEqual(['run-b.json']);
  });
});
