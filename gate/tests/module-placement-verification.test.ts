import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from '../../process/files/files.js';

import { afterEach, describe, expect, it } from 'bun:test';

import { executeVerify } from '../execute-verify/execute-verify.js';
import { useIsolatedAgentQualityGateHome } from '../../tests/support/isolated-home.js';

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

describe('module-placement preset verification', () => {
  it('is a no-op when the preset is enabled without modulePlacement config', async () => {
    const projectRoot = await makeTempDirectory('module-placement-no-config-');
    await mkdir(join(projectRoot, 'system', 'agents'), { recursive: true });
    await writeTextFile(
      join(projectRoot, 'system', 'agents', 'worker-runtime.ts'),
      'export const x = 1;\n',
    );

    const result = await executeVerify({
      projectRoot,
      entries: ['system/agents/worker-runtime.ts'],
      presets: ['module-placement'],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
  });

  it('rejects flat files under configured directories', async () => {
    const projectRoot = await makeTempDirectory('module-placement-flat-');
    await mkdir(join(projectRoot, 'system', 'agents'), { recursive: true });
    await writeTextFile(
      join(projectRoot, 'system', 'agents', 'worker-runtime.ts'),
      'export const x = 1;\n',
    );

    const result = await executeVerify({
      projectRoot,
      entries: ['system/agents/worker-runtime.ts'],
      presets: ['module-placement'],
      modulePlacement: {
        directories: ['system/agents'],
        rootExceptions: {},
      },
    });

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('module-placement(module-placement)');
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Production modules must live in system/agents/<concern>/, not directly under system/agents/.',
    );
  });

  it('allows nested concern directories from modulePlacement config', async () => {
    const projectRoot = await makeTempDirectory('module-placement-valid-');
    await mkdir(join(projectRoot, 'system', 'agents', 'workers'), { recursive: true });
    await writeTextFile(
      join(projectRoot, 'system', 'agents', 'workers', 'worker-runtime.ts'),
      'export const x = 1;\n',
    );

    const result = await executeVerify({
      projectRoot,
      entries: ['system/agents/workers/worker-runtime.ts'],
      presets: ['module-placement'],
      modulePlacement: {
        directories: ['system/agents'],
        rootExceptions: {},
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('verify: ok');
  });
});
