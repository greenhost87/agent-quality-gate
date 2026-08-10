import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';
import { spawn } from 'bun';

const GENERATE_AGENT_GUIDE_PATH = join(import.meta.dir, '..', 'bin', 'generate-agent-guide.ts');
const tempDirectories: string[] = [];

async function runGenerator(cwd: string, args: readonly string[] = []) {
  const child = spawn(['bun', GENERATE_AGENT_GUIDE_PATH, ...args], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

async function createProject(config: object): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'agent-guide-project-'));
  tempDirectories.push(cwd);
  await writeFile(join(cwd, 'agent-quality-gate.config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return cwd;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('generate-agent-guide', () => {
  it('writes a compact guide from the effective project policy', async () => {
    const cwd = await createProject({
      entries: ['src/index.ts'],
      fallowIgnorePatterns: ['migrations/**'],
      health: { maxCyclomatic: 8 },
      plugins: [
        {
          name: 'react',
          rules: { 'react/rules-of-hooks': 'error' },
        },
      ],
    });

    const result = await runGenerator(cwd);
    const guide = await readFile(join(cwd, 'agent-quality-gate.md'), 'utf8');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('generate-agent-guide: wrote agent-quality-gate.md');
    expect(guide).toContain('Lint suppression: Oxlint disable directives are forbidden');
    expect(guide).toContain('Functions: inline thin local forwarding functions that have only one caller.');
    expect(guide).toContain('indexed access types are forbidden except for the exact form `(typeof identifier)[number]`');
    expect(guide).toContain('declare exported non-empty catalogs as unannotated `as const` tuples');
    expect(guide).toContain('derive their union types from the runtime tuple instead of duplicating them manually');
    expect(guide).toContain('exported unannotated `as const` string literal catalogs');
    expect(guide).toContain('runtime files normally cannot contain top-level types');
    expect(guide).toContain('`(typeof localExportedConst)[number]` derived from an exported `as const` string literal catalog in the same file');
    expect(guide).not.toContain('quality/no-single-use-forwarders');
    expect(guide).not.toContain('## Validation scope');
    expect(guide).toContain('cyclomatic `8`, cognitive `15`, and CRAP `999`');
    expect(guide).toContain('`react/rules-of-hooks`: `error`');
    expect(guide.indexOf('## Project-specific Oxlint rules')).toBeLessThan(
      guide.indexOf('## Locked coding constraints')
    );
    expect(guide.indexOf('## Locked coding constraints')).toBeLessThan(
      guide.indexOf('## Standard checks summarized')
    );
    expect(Buffer.byteLength(guide)).toBeLessThan(8_192);
  });

  it('rejects invalid configuration and unexpected arguments', async () => {
    const cwd = await createProject({ entries: [] });

    const invalidConfig = await runGenerator(cwd);
    const unexpectedArgument = await runGenerator(cwd, ['extra']);

    expect(invalidConfig.exitCode).toBe(2);
    expect(invalidConfig.stderr).toContain('entries must be a non-empty string array');
    expect(unexpectedArgument.exitCode).toBe(2);
    expect(unexpectedArgument.stderr).toContain('unexpected argument "extra"');
  });
});
