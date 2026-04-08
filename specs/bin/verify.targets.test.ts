import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'bun:test';

import { resolveVerifyTargets } from '../../src/verify/targets.js';

async function makeTempRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'verify-targets-'));
  const init = spawnSync('git', ['init'], { cwd, encoding: 'utf-8' });
  if ((init.status ?? 1) !== 0) {
    throw new Error(init.stderr || init.stdout || 'git init failed');
  }
  return cwd;
}

function runGit(cwd: string, args: readonly string[]): void {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  }
}

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const cwd = tempDirs.pop();
    if (!cwd) {
      continue;
    }
    await rm(cwd, { force: true, recursive: true });
  }
});

describe('resolveVerifyTargets', () => {
  it('ignores tracked files deleted from the working tree', async () => {
    const cwd = await makeTempRepo();
    tempDirs.push(cwd);

    await mkdir(join(cwd, 'src'), { recursive: true });
    await writeFile(join(cwd, 'src', 'live.ts'), 'export const live = 1;\n', 'utf-8');
    await writeFile(join(cwd, 'src', 'deleted.ts'), 'export const deleted = 1;\n', 'utf-8');
    runGit(cwd, ['add', 'src/live.ts', 'src/deleted.ts']);
    await rm(join(cwd, 'src', 'deleted.ts'));

    const targets = resolveVerifyTargets(cwd);

    expect(targets.eslint).toContain('src/live.ts');
    expect(targets.eslint).not.toContain('src/deleted.ts');
    expect(targets.tsc).toContain('src/live.ts');
    expect(targets.tsc).not.toContain('src/deleted.ts');
  });
});
