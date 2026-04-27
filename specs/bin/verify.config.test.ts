import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { createDefaultVerifyStepsResult, resolveVerifyPlan } from '../../src/verify/index.js';

const createdTempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'verify-config-'));
  createdTempDirs.push(dir);
  return dir;
}

describe('verify config loading', () => {
  afterEach(async () => {
    await Promise.all(
      createdTempDirs.splice(0).map(async (dir) => {
        await rm(dir, { force: true, recursive: true });
      })
    );
  });

  it('uses bundled config paths when project has no local tool configs', async () => {
    const cwd = await makeTempDir();
    await mkdir(join(cwd, 'docs'), { recursive: true });
    await mkdir(join(cwd, 'src'), { recursive: true });
    await writeFile(join(cwd, 'src', 'entry.ts'), 'export const value = 1;\n', 'utf-8');
    await writeFile(join(cwd, 'src', 'clone.ts'), 'export const value = 1;\n', 'utf-8');
    await writeFile(join(cwd, 'docs', 'readme.md'), '# docs\n', 'utf-8');

    const resolved = createDefaultVerifyStepsResult({ cwd });
    expect(resolved.steps.map((step) => step.name)).toEqual([
      'protected-coverage',
      'eslint',
      'markdown-headings',
      'tsc',
      'duplicate-shapes',
      'depcruise',
      'knip',
      'jscpd',
      'eslint-length',
    ]);
    expect(resolved.stepDebugInfo[0]).toEqual({ name: 'protected-coverage', source: 'bundled' });
    const markdownHeadingsStep = resolved.steps.find((step) => step.name === 'markdown-headings');
    expect(markdownHeadingsStep).toBeDefined();
    expect(markdownHeadingsStep?.args[0]).toContain('verify');
    expect(markdownHeadingsStep?.args).toContain('--agent-quality-gate-internal');
    expect(markdownHeadingsStep?.args).toContain('markdown-headings');
    for (const info of resolved.stepDebugInfo.slice(1)) {
      expect(info.source).toBe('bundled');
      if (info.name === 'markdown-headings') {
        expect(info.configPath).toBeUndefined();
      } else {
        expect(info.configPath).toBeDefined();
      }
    }
  });

  it('ignores local eslint config and keeps bundled config path', async () => {
    const cwd = await makeTempDir();
    await mkdir(join(cwd, 'src'), { recursive: true });
    await writeFile(join(cwd, 'src', 'index.ts'), 'export const value = 1;\n', 'utf-8');
    await writeFile(join(cwd, 'eslint.config.mjs'), 'export default [];\n', 'utf-8');

    const resolved = createDefaultVerifyStepsResult({ cwd });
    const eslintStep = resolved.steps.find((step) => step.name === 'eslint');
    expect(eslintStep).toBeDefined();
    expect(eslintStep?.args).toContain('--config');
    expect(eslintStep?.args).not.toContain(join(cwd, 'eslint.config.mjs'));
    expect(eslintStep?.args[0]).toContain('verify');
    expect(eslintStep?.args).toContain('--agent-quality-gate-internal');
    expect(eslintStep?.args).toContain('tool');
    expect(eslintStep?.args).toContain('eslint');
  });

  it('rejects local verify config file in locked mode', async () => {
    const cwd = await makeTempDir();
    await writeFile(
      join(cwd, 'verify.config.json'),
      JSON.stringify({
        steps: [{ name: 'custom', command: 'bun', args: ['run', 'custom-check'] }],
      }),
      'utf-8'
    );

    await expect(resolveVerifyPlan({ cwd })).rejects.toThrow(
      `verify: local verify config is not allowed in locked mode: ${join(cwd, 'verify.config.json')}`
    );
  });

  it('rejects explicit --config path in locked mode', async () => {
    const cwd = await makeTempDir();
    await expect(resolveVerifyPlan({ cwd, configPath: 'verify.config.json' })).rejects.toThrow(
      `verify: local verify config is not allowed in locked mode: ${join(cwd, 'verify.config.json')}`
    );
  });
});
