import { expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import baselineConfig from '../../oxlint.json';

it('enforces 400 TS and 500 TSX code lines through baseline overrides', async () => {
  const root = mkdtempSync(resolve(import.meta.dir, '../../.quality-fixtures/max-code-lines-'));
  try {
    const files = [
      { name: 'at-limit.ts', count: 400 },
      { name: 'over-limit.ts', count: 401 },
      { name: 'at-limit.tsx', count: 500 },
      { name: 'over-limit.tsx', count: 501 },
    ];
    for (const file of files) {
      const lines = Array.from(
        { length: file.count },
        (_, index) => `export const value${String(index)} = ${String(index)}; /* 😀 */`,
      );
      await Bun.write(
        join(root, file.name),
        '// ignored\u2028/* multiline\r\ncomment */\r\n' +
          'import { /* inside import */\r\nitem\r\n} from "./dependency"; ' +
          lines.join('\r\n'),
      );
    }
    const configPath = join(root, 'oxlint.json');
    await Bun.write(
      configPath,
      JSON.stringify({
        ...baselineConfig,
        jsPlugins: baselineConfig.jsPlugins.map((plugin) => ({
          ...plugin,
          specifier: resolve(import.meta.dir, '../..', plugin.specifier),
        })),
      }),
    );
    const child = Bun.spawn({
      cmd: [
        resolve('node_modules/.bin/oxlint'),
        '--config',
        configPath,
        '--format',
        'agent',
        ...files.map((file) => join(root, file.name)),
      ],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe('');
    expect(status).toBe(1);
    expect(stdout).toContain('File has 401 code lines; maximum is 400');
    expect(stdout).toContain('File has 501 code lines; maximum is 500');
    expect(stdout).not.toContain('at-limit.ts');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
