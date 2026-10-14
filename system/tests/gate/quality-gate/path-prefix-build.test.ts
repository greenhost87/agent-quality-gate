import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import * as v from 'valibot';

import { runCapturedProcess } from '#system/process/run-command/run-command.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

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
const { tempDirectories: roots } = useTrackedTempDirectories();

for (const mode of ['default', 'on', 'off'] as const) {
  test(`build path prefixes ${mode}: only direct responses change, spill keeps full paths`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'aqg-path-prefix-build-'));
    roots.push(root);
    const bundle = join(root, 'run.js');
    const build = await runCapturedProcess({
      command: 'bun',
      cwd: join(import.meta.dir, '../../../..'),
      args: [
        'build',
        '--target',
        'bun',
        '--format',
        'esm',
        ...(mode === 'default' ? [] : ['--define', `AQG_PATH_PREFIXES=${String(mode === 'on')}`]),
        './system/tests/gate/.quality-fixtures/path-prefix-build/run.ts',
        '--outfile',
        bundle,
      ],
    });
    expect(build.exitCode).toBe(0);
    const run = await runCapturedProcess({ command: 'bun', args: [bundle, root], cwd: root });
    expect(run.exitCode).toBe(0);
    const result = v.parse(v.pipe(v.string(), v.parseJson(), OutputSchema), run.stdout);
    expect(result.visible.text.split('\n').length).toBeLessThanOrEqual(5);
    expect(result.spilled.text.split('\n').length).toBeLessThanOrEqual(5);
    expect(result.complete.spillPath).toBeUndefined();
    expect(result.complete.text.split('\n').length).toBeLessThanOrEqual(result.budget);
    for (let index = 0; index < 12; index += 1) {
      expect(result.complete.text).toContain(`rule-${String(index)}:`);
    }
    if (mode === 'on') {
      expect(result.complete.text).toContain('Path prefixes');
      expect(result.complete.text).toContain('@p1/');
      expect(result.complete.text.length).toBeLessThan(result.fullText.length);
      expect(result.spillText).not.toContain('Path prefixes');
      expect(result.spillText).not.toContain('@p1/');
    } else {
      expect(result.visible.text).not.toContain('Path prefixes');
      expect(result.visible.text).not.toContain('@p1/');
      expect(result.spilled.text).not.toContain('Path prefixes');
      expect(result.spilled.text).not.toContain('@p1/');
    }
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
