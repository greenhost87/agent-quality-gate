import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { resolvePresetContract } from '../../../../preset-catalog/catalog/preset-catalog.ts';
import { useIsolatedAgentQualityGateHome } from '../../../../tests/support/isolated-home.ts';
import { linkPresetIntoAgentQualityGateHome } from '../../../../tests/support/link-home-preset.ts';
import {
  createReactProject,
  removeTrackedTempDirectories,
} from '../../../../tests/support/react-project.ts';
import {
  loadGeneratedConfig,
  runOxlint,
  writeDiagnosticConfig,
  writePresetConfig,
} from './helpers.ts';

useIsolatedAgentQualityGateHome();

beforeAll(async () => {
  await linkPresetIntoAgentQualityGateHome(
    'react-presentation',
    join(import.meta.dir, '../../..', 'react-presentation'),
  );
  await linkPresetIntoAgentQualityGateHome('nextjs', join(import.meta.dir, '../..'));
});

const tempDirectories: string[] = [];
const fixturesRoot = join(import.meta.dir, '../../.quality-fixtures');

afterEach(async () => {
  await removeTrackedTempDirectories(tempDirectories);
});

async function copyFixture(projectRoot: string, relative: string, dest: string): Promise<string> {
  const absolute = join(projectRoot, dest);
  await mkdir(dirname(absolute), { recursive: true });
  await copyFile(join(fixturesRoot, relative), absolute);
  return absolute;
}

describe('nextjs preset contract', () => {
  it('requires react-presentation and does not reverse-activate from react-presentation alone', async () => {
    const nextjs = await resolvePresetContract(['nextjs']);
    expect(nextjs.names).toEqual(['baseline', 'react-presentation', 'nextjs']);
    expect(nextjs.nativePlugins).toContain('react');
    expect(nextjs.nativePlugins).toContain('nextjs');
    expect(nextjs.rules['nextjs/no-img-element']).toEqual({
      severity: 'error',
      phase: 'ui',
    });
    expect(nextjs.rules['react/immutability']).toEqual({
      severity: 'error',
      phase: 'ui',
    });

    const reactOnly = await resolvePresetContract(['react-presentation']);
    expect(reactOnly.names).toEqual(['baseline', 'react-presentation']);
    expect(reactOnly.names).not.toContain('nextjs');
    expect(reactOnly.rules['nextjs/no-img-element']).toBeUndefined();
  });

  it('generated config includes nextjs plugin without jsx-a11y', async () => {
    const cwd = await createReactProject(tempDirectories);
    const configPath = await writePresetConfig(cwd, ['nextjs']);
    const config = await loadGeneratedConfig(configPath);
    expect(config.plugins).toContain('nextjs');
    expect(config.plugins).toContain('react');
    expect(config.plugins).not.toContain('jsx-a11y');
    expect(config.rules['nextjs/no-img-element']).toBe('error');
    expect(config.rules['nextjs/no-html-link-for-pages']).toBe('error');
  });
});

describe('nextjs preset rules', () => {
  it('rejects raw img, html page links, font display, sync scripts, and inline script without id', async () => {
    const cwd = await createReactProject(tempDirectories);
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
