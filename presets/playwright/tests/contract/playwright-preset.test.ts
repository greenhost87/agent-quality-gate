import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../../../process/files/files.ts';

import { afterEach, describe, expect, it } from 'bun:test';

import { executeVerify } from '../../../../gate/execute-verify/execute-verify.ts';
import { resolvePresetContract } from '../../../../preset-catalog/catalog/preset-catalog.ts';
import { useIsolatedAgentQualityGateHome } from '../../../../tests/support/isolated-home.ts';

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

describe('playwright preset contract', () => {
  it('accepts playwright as a builtin independent preset', async () => {
    const contract = await resolvePresetContract(['playwright']);
    expect(contract.names).toEqual(['baseline', 'playwright']);
    expect(contract.plugins.map((plugin) => plugin.name)).toEqual(['aqg', 'playwright']);
    expect(contract.rules['playwright/e2e-runner']).toEqual({
      severity: 'error',
      phase: 'boundaries',
    });
    expect(contract.rules['playwright/e2e-black-box']).toEqual({
      severity: 'error',
      phase: 'boundaries',
    });
    expect(contract.rules['playwright/config']).toEqual({
      severity: 'error',
      phase: 'boundaries',
    });
    expect(contract.files.map((file) => file.destination)).toEqual([
      'scripts/playwright-web-server.ts',
    ]);
  });

  it('does not require a Playwright config when the project has no e2e surface', async () => {
    const cwd = await makeTempDirectory('aqg-playwright-idle-');
    await mkdir(join(cwd, 'src'), { recursive: true });
    await writeTextFile(
      join(cwd, 'package.json'),
      `${JSON.stringify({ name: 'idle', private: true, type: 'module' }, null, 2)}\n`,
    );
    await writeTextFile(join(cwd, 'src/index.ts'), 'export const value = 1;\n');

    const result = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['playwright'],
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('scripts/playwright-web-server.ts (missing)');
    expect(result.stderr).toContain('example .aqg/playwright/scripts/playwright-web-server.ts');
    expect(result.stderr).not.toContain('playwright-config:');
  });

  it('requires a Playwright config when @playwright/test is a dependency', async () => {
    const cwd = await makeTempDirectory('aqg-playwright-missing-config-');
    await mkdir(join(cwd, 'src'), { recursive: true });
    await writeTextFile(
      join(cwd, 'package.json'),
      `${JSON.stringify(
        {
          name: 'missing-config',
          private: true,
          type: 'module',
          devDependencies: { '@playwright/test': '1.62.1' },
        },
        null,
        2,
      )}\n`,
    );
    await writeTextFile(join(cwd, 'src/index.ts'), 'export const value = 1;\n');

    const inactive = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
    });
    expect(inactive.exitCode).toBe(0);
    expect(inactive.stderr).not.toContain('playwright-config:');

    const active = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['playwright'],
    });
    expect(active.exitCode).toBe(1);
    expect(active.stderr).toContain(
      'playwright-config: add playwright.config.ts with use.baseURL and webServer',
    );
  });
});
