import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { write } from 'bun';

import { resolvePresetContract } from 'agent-quality-gate/shared/verify';
import { getOptionalEnv } from 'agent-quality-gate/shared/verify';
import {
  loadGeneratedConfig,
  runOxlint,
  writeDiagnosticConfig,
  writePresetConfig,
} from './helpers.ts';

const tempDirectories: string[] = [];
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

async function makeTrackedTempDirectory(
  trackedDirectories: string[],
  prefix: string,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  trackedDirectories.push(directory);
  return directory;
}

beforeAll(async () => {
  await linkPresetIntoAgentQualityGateHome('nextjs', join(import.meta.dir, '../..'));
});

const fixturesRoot = join(import.meta.dir, '../../.quality-fixtures');

async function linkPresetIntoAgentQualityGateHome(
  presetName: string,
  presetRoot: string,
): Promise<void> {
  const home = getOptionalEnv('AGENT_QUALITY_GATE_HOME');
  if (home === undefined || home.length === 0) {
    throw new Error('AGENT_QUALITY_GATE_HOME must be set before linking a preset');
  }
  const presetsDir = join(home, 'presets');
  await mkdir(presetsDir, { recursive: true });
  await symlink(resolve(presetRoot), join(presetsDir, presetName));
}

async function createReactProject(): Promise<string> {
  const cwd = await makeTrackedTempDirectory(tempDirectories, 'aqg-react-project-');
  await write(
    join(cwd, 'package.json'),
    `${JSON.stringify({ name: 'sample-react-fixture', private: true, type: 'module' }, null, 2)}\n`,
  );
  await write(
    join(cwd, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        include: ['**/*.tsx', '**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function copyFixture(projectRoot: string, relative: string, dest: string): Promise<string> {
  const absolute = join(projectRoot, dest);
  await mkdir(dirname(absolute), { recursive: true });
  await copyFile(join(fixturesRoot, relative), absolute);
  return absolute;
}

describe('nextjs preset contract', () => {
  it('activates independently with its own plugin and rules', async () => {
    const nextjs = await resolvePresetContract(['nextjs']);
    expect(nextjs.names).toEqual(['baseline', 'nextjs']);
    expect(nextjs.nativePlugins).toEqual(['nextjs']);
    expect(nextjs.rules['nextjs/no-img-element']).toEqual({
      severity: 'error',
      phase: 'ui',
    });
  });

  it('generated config includes nextjs plugin without jsx-a11y', async () => {
    const cwd = await createReactProject();
    const configPath = await writePresetConfig(cwd, ['nextjs']);
    const config = await loadGeneratedConfig(configPath);
    expect(config.plugins).toContain('nextjs');
    expect(config.plugins).not.toContain('jsx-a11y');
    expect(config.rules['nextjs/no-img-element']).toBe('error');
    expect(config.rules['nextjs/no-html-link-for-pages']).toBe('error');
  });
});

describe('nextjs preset rules', () => {
  it('rejects raw img, html page links, font display, sync scripts, and inline script without id', async () => {
    const cwd = await createReactProject();
    const configPath = await writeDiagnosticConfig(cwd, ['nextjs']);

    const badImg = await copyFixture(cwd, 'no-img-element/invalid/page.tsx', 'app/bad-img.tsx');
    const badImgResult = runOxlint(cwd, configPath, badImg);
    expect(badImgResult.status).not.toBe(0);
    expect(badImgResult.output).toContain('no-img-element');

    const badLink = await copyFixture(
      cwd,
      'no-html-link-for-pages/invalid/page.tsx',
      'app/bad-link.tsx',
    );
    const badLinkResult = runOxlint(cwd, configPath, badLink);
    expect(badLinkResult.status).not.toBe(0);
    expect(badLinkResult.output).toContain('no-html-link-for-pages');

    const font = await copyFixture(cwd, 'google-font-display/invalid/page.tsx', 'app/font.tsx');
    const fontResult = runOxlint(cwd, configPath, font);
    expect(fontResult.status).not.toBe(0);
    expect(fontResult.output).toContain('google-font-display');

    const sync = await copyFixture(cwd, 'no-sync-scripts/invalid/page.tsx', 'app/sync.tsx');
    const syncResult = runOxlint(cwd, configPath, sync);
    expect(syncResult.status).not.toBe(0);
    expect(syncResult.output).toContain('no-sync-scripts');

    const inline = await copyFixture(cwd, 'inline-script-id/invalid/page.tsx', 'app/inline.tsx');
    const inlineResult = runOxlint(cwd, configPath, inline);
    expect(inlineResult.status).not.toBe(0);
    expect(inlineResult.output).toContain('inline-script-id');
  });
});
