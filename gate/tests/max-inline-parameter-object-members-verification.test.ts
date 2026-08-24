import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import { executeVerify } from '../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';

useIsolatedAgentQualityGateHome();

const WIDE =
  'export function run(options: { name: string; args: readonly string[]; cwd?: string; environment?: Record<string, string> }): void { void options; }\n';

const ALLOWED =
  'export function run(options: { name: string; args: readonly string[]; cwd?: string }): void { void options; }\n';

const tempDirectories: string[] = [];

async function makeProject(source: string): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'max-inline-parameter-object-members-'));
  tempDirectories.push(projectRoot);
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  await writeTextFile(join(projectRoot, 'src', 'index.ts'), source);
  return projectRoot;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe('max-inline-parameter-object-members verification', () => {
  it('allows wide inline parameter objects when baseline config is omitted', async () => {
    const projectRoot = await makeProject(WIDE);
    const result = await executeVerify({
      projectRoot,
      entries: ['src/index.ts'],
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
  });

  it('allows wide inline parameter objects when max is -1', async () => {
    const projectRoot = await makeProject(WIDE);
    const result = await executeVerify({
      projectRoot,
      entries: ['src/index.ts'],
      baseline: { maxInlineParameterObjectMembers: -1 },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
  });

  it('rejects wide inline parameter objects when max is 3', async () => {
    const projectRoot = await makeProject(WIDE);
    const result = await executeVerify({
      projectRoot,
      entries: ['src/index.ts'],
      baseline: { maxInlineParameterObjectMembers: 3 },
    });
    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'aqg(max-inline-parameter-object-members)',
    );
  });

  it('allows inline parameter objects with at most 3 members when max is 3', async () => {
    const projectRoot = await makeProject(ALLOWED);
    const result = await executeVerify({
      projectRoot,
      entries: ['src/index.ts'],
      baseline: { maxInlineParameterObjectMembers: 3 },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
  });
});
