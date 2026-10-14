import { describe, expect, it } from 'bun:test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import { createOptionsRefCache } from 'agent-quality-gate/shared/oxlint';

const PROJECT_ROOT = '/workspace/project';

type PlacementOptions = ReadonlyArray<{
  directories: string[];
  rootExceptions: Record<string, string[]>;
  forbidConcernPrefix: string[];
  maxDepth: Record<string, number>;
}>;

describe('module-placement options ref cache integration', () => {
  it('accepts stable and changing options refs without throwing or leaking skip state', async () => {
    const mod = await import(
      pathToFileURL(join(import.meta.dir, '../../oxlint/module-placement.ts')).href
    );
    const rule = mod.default.rules['module-placement'];

    const optionsA: PlacementOptions = [
      {
        directories: ['app/app'],
        rootExceptions: {},
        forbidConcernPrefix: [],
        maxDepth: { 'app/app': 2 },
      },
    ];
    const optionsB: PlacementOptions = [
      {
        directories: ['app/components/ui'],
        rootExceptions: {},
        forbidConcernPrefix: [],
        maxDepth: { 'app/components/ui': 2 },
      },
    ];

    const ctx = {
      id: 'module-placement/module-placement',
      options: optionsA as unknown[],
      filename: join(PROJECT_ROOT, 'app/app/x.ts'),
      cwd: PROJECT_ROOT,
      sourceCode: { ast: { type: 'Program', body: [], range: [0, 0] } },
      report() {},
    };
    const visitors = rule.createOnce(ctx);

    for (let i = 0; i < 20; i++) {
      ctx.options = optionsA as unknown[];
      expect(visitors.before?.()).toBeUndefined();
    }
    for (let i = 0; i < 5; i++) {
      ctx.options = optionsB as unknown[];
      expect(visitors.before?.()).toBeUndefined();
    }
    ctx.options = optionsA as unknown[];
    expect(visitors.before?.()).toBeUndefined();

    ctx.options = [{ directories: [] }];
    expect(visitors.before?.()).toBe(false);

    let parseCalls = 0;
    const cache = createOptionsRefCache((options: PlacementOptions) => {
      parseCalls += 1;
      return options[0]?.directories ?? [];
    });
    expect(cache.get(optionsA)).toEqual(['app/app']);
    expect(cache.get(optionsA)).toEqual(['app/app']);
    expect(cache.get(optionsB)).toEqual(['app/components/ui']);
    expect(parseCalls).toBe(2);
  });
});
