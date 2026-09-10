import { describe, expect, it } from 'bun:test';

import { runOxlintFixture } from '../support/run-oxlint.ts';

const RULE = 'aqg/max-code-lines';

const cases = [
  { entry: 'imports.ts', count: 5 },
  { entry: 'component.tsx', count: 7 },
  { entry: 'line-endings.ts', count: 4 },
];

describe('max-code-lines', () => {
  it('allows an import-and-comment-only file with a zero limit', async () => {
    const result = await runOxlintFixture('max-code-lines', 'empty.ts', RULE, [
      'error',
      { max: 0 },
    ]);
    expect(result.status).toBe(0);
  });
  for (const { entry, count } of cases) {
    it(`${entry}: accepts the exact code-line limit`, async () => {
      const result = await runOxlintFixture('max-code-lines', entry, RULE, [
        'error',
        { max: count },
      ]);
      expect(result.status).toBe(0);
    });

    it(`${entry}: rejects one line above the limit`, async () => {
      const result = await runOxlintFixture('max-code-lines', entry, RULE, [
        'error',
        { max: count - 1 },
      ]);
      expect(result.status).toBe(1);
      expect(result.output).toContain(`File has ${String(count)} code lines`);
    });
  }
});
