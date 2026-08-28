import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'bun';
import { afterEach, describe, expect, it } from 'bun:test';
import { readTextFile, writeTextFile } from '../../../process/files/files.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  stdinText?: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const child = spawn([command, ...args], {
    cwd,
    stderr: 'pipe',
    stdin: stdinText === undefined ? undefined : 'pipe',
    stdout: 'pipe',
  });
  if (stdinText !== undefined) {
    await child.stdin.write(stdinText);
    await child.stdin.end();
  }
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

describe('session stop hook release bundle', () => {
  it('keeps import.meta.main and runs stdin JSON as the Codex entrypoint', async () => {
    const install = await mkdtemp(join(tmpdir(), 'aqg-session-stop-bundle-'));
    tempDirectories.push(install);
    const codexDir = join(install, 'dist', 'codex');
    const assetsDir = join(install, 'dist', 'extensions', 'assets');
    await mkdir(codexDir, { recursive: true });
    await mkdir(assetsDir, { recursive: true });
    await writeTextFile(join(assetsDir, 'oxlint.config.ts'), 'export default {};\n');
    await writeTextFile(join(assetsDir, '.fallowrc.json'), '{}\n');
    const outfile = join(codexDir, 'stop-hook.js');

    const build = await runCommand(
      'bun',
      [
        'build',
        '--target',
        'bun',
        '--format',
        'esm',
        './adapters/hooks/session-stop-hook.ts',
        '--outfile',
        outfile,
      ],
      REPO_ROOT,
    );
    expect(build.exitCode).toBe(0);

    const bundled = await readTextFile(outfile);
    expect(bundled).toContain('import.meta.main');
    expect(bundled).not.toContain('if (false) {}');

    const run = await runCommand('bun', [outfile, 'codex'], REPO_ROOT, '{}\n');
    expect(run.stderr).toBe('');
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toBe('{}\n');
  });
});
