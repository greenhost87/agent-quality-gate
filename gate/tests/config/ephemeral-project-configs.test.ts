import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  it('removes verify configs and empties ephemeral directories', async () => {
    const projectRoot = await makeTempDirectory('aqg-ephemeral-project-');
    const oxlintDir = join(projectRoot, '.aqg', 'oxlint');
    const fallowDir = join(projectRoot, '.aqg', 'fallow');
    const oxlintConfigPath = join(oxlintDir, 'verify.config.ts');
    const fallowConfigPath = join(fallowDir, 'verify.json');
    await mkdir(oxlintDir, { recursive: true });
    await mkdir(fallowDir, { recursive: true });
    await writeFile(oxlintConfigPath, 'export default {};\n');
    await writeFile(fallowConfigPath, '{}\n');

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
    const projectRoot = await makeTempDirectory('aqg-ephemeral-project-');
    const artifactPath = join(projectRoot, '.aqg', 'parse_example.ts');
    const oxlintDir = join(projectRoot, '.aqg', 'oxlint');
    const fallowDir = join(projectRoot, '.aqg', 'fallow');
    const oxlintConfigPath = join(oxlintDir, 'verify.config.ts');
    const fallowConfigPath = join(fallowDir, 'verify.json');
    const staleOxlintPath = join(oxlintDir, '19b7-mtbxqp7i-ed29e8d5.config.ts');
    const staleFallowPath = join(fallowDir, 'presentation-duplication-100x-mtbwnqf3-cac9ef5d.json');
    const staleFallowOutputPath = join(
      fallowDir,
      'presentation-duplication-100x-mtbwnqf3-7725fb5c.out.json',
    );
    await mkdir(oxlintDir, { recursive: true });
    await mkdir(fallowDir, { recursive: true });
    await writeFile(artifactPath, 'export {};\n');
    await writeFile(oxlintConfigPath, 'export default {};\n');
    await writeFile(staleOxlintPath, 'export default {};\n');
    await writeFile(fallowConfigPath, '{}\n');
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
