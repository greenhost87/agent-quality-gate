import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from 'agent-quality-gate/shared/verify';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { executeVerify } from 'agent-quality-gate/shared/verify';
import { resolvePresetContract } from 'agent-quality-gate/shared/verify';
let isolatedHome = '';
let previousHome: string | undefined;

beforeAll(async () => {
  isolatedHome = await mkdtemp(join(tmpdir(), 'aqg-home-'));
  previousHome = process.env.AGENT_QUALITY_GATE_HOME;
  process.env.AGENT_QUALITY_GATE_HOME = isolatedHome;
});

beforeEach(() => {
  process.env.AGENT_QUALITY_GATE_HOME = isolatedHome;
});

afterAll(async () => {
  if (previousHome === undefined) delete process.env.AGENT_QUALITY_GATE_HOME;
  else process.env.AGENT_QUALITY_GATE_HOME = previousHome;
  await rm(isolatedHome, { recursive: true, force: true });
});

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
    expect(contract.files).toEqual([]);
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
    expect(result.exitCode).toBe(0);
    expect(JSON.stringify(result)).not.toContain('playwright-config:');
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
    await mkdir(join(cwd, 'node_modules', '@playwright', 'test'), { recursive: true });
    await writeTextFile(
      join(cwd, 'node_modules', '@playwright', 'test', 'package.json'),
      '{"name":"@playwright/test"}\n',
    );

    const inactive = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
    });
    expect(inactive.exitCode).toBe(0);
    expect(JSON.stringify(inactive)).not.toContain('playwright/config');

    const active = await executeVerify({
      projectRoot: cwd,
      entries: ['src/index.ts'],
      presets: ['playwright'],
    });
    expect(active.exitCode).toBe(1);
    expect(JSON.stringify(active)).toContain('playwright/config');
    expect(JSON.stringify(active)).toContain(
      'add playwright.config.ts with use.baseURL and webServer',
    );
  });
});
