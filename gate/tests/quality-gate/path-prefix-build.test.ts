import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'bun:test';
import * as v from 'valibot';

import { runCapturedProcess } from '../../../process/run-command/run-command.js';

const PresentedSchema = v.object({
  text: v.string(),
  full: v.optional(v.string()),
  spillPath: v.optional(v.string()),
});
const OutputSchema = v.object({
  visible: PresentedSchema,
  spilled: PresentedSchema,
  complete: PresentedSchema,
  fullText: v.string(),
  spillText: v.string(),
  budget: v.number(),
});
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })),
  );
});

for (const mode of ['default', 'on', 'off'] as const) {
  test(`build path prefixes ${mode}: only direct responses change, spill keeps full paths`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'aqg-path-prefix-build-'));
    roots.push(root);
    const bundle = join(root, 'run.js');
    const build = await runCapturedProcess({
      command: 'bun',
      cwd: join(import.meta.dir, '../../..'),
      args: [
        'build',
        '--target',
        'bun',
        '--format',
        'esm',
        ...(mode === 'default' ? [] : ['--define', `AQG_PATH_PREFIXES=${String(mode === 'on')}`]),
        './gate/.quality-fixtures/path-prefix-build/run.ts',
        '--outfile',
        bundle,
      ],
    });
    expect(build.exitCode).toBe(0);
    const run = await runCapturedProcess({ command: 'bun', args: [bundle, root], cwd: root });
    expect(run.exitCode).toBe(0);
    const result = v.parse(v.pipe(v.string(), v.parseJson(), OutputSchema), run.stdout);
    if (mode === 'on') {
      expect(result.visible.text).toContain('Path prefixes');
      expect(result.visible.text).toContain('@p1/');
      expect(result.visible.text.length).toBeLessThan(result.fullText.length);
      expect(result.spilled.text).toContain('Path prefixes');
      // R11: complete-set compression precedes the spill decision.
      expect(result.complete.spillPath).toBeUndefined();
      for (let index = 0; index < 12; index += 1) {
        expect(result.complete.text).toContain(`rule-${String(index)}:`);
      }
    } else {
      expect(result.visible.text).toBe(result.fullText);
      expect(result.spilled.text).not.toContain('Path prefixes');
      expect(result.spilled.text).not.toContain('@p1/');
      expect(result.complete.spillPath).toBeDefined();
    }
    expect(result.complete.text.length).toBeLessThanOrEqual(result.budget);
    expect(result.spilled.text.length).toBeLessThanOrEqual(4000);
    expect(result.spilled.spillPath).toBe('.aqg/aqg-verify-failure.log');
    expect(result.spilled.full).not.toContain('Path prefixes');
    expect(result.spilled.full).toContain('app/components/features/very-long-feature-directory');
    expect(result.spillText).not.toContain('@p1/');
    expect(result.spillText).not.toContain('Path prefixes');
    expect(result.spillText).toContain(
      'app/components/features/very-long-feature-directory/zz-oversized.tsx',
    );
  });
}
