import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { collectPresetDiagnosticHints } from '#system/presets/load-preset-gate-config.ts';
import type { Diagnostic } from '#system/gate/run/check-result.ts';

const root = join(import.meta.dir, '../../../../presets');
const activated = ['baseline', 'bun-parse', 'database', 'playwright'].map((name) => ({
  name,
  root: join(root, name),
}));

function diagnostic(ruleId: string): Diagnostic {
  return { source: 'oxlint', ruleId, severity: 'error', message: 'finding' };
}

describe('preset diagnostic hints', () => {
  it('emits only the active preset hints for selected rules, not message text', async () => {
    const selected = [
      diagnostic('database/dao-boundaries'),
      diagnostic('bun-parse/no-raw-json-parse'),
      diagnostic('aqg/no-thin-forwarders'),
      diagnostic('no-restricted-imports'),
      diagnostic('playwright/e2e-runner'),
    ];
    const hints = await collectPresetDiagnosticHints(activated, selected);
    expect(
      hints.filter((hint) => hint.kind === 'document').map(({ owner, id }) => ({ owner, id })),
    ).toEqual([
      { owner: 'baseline', id: 'avoid-micro-splits' },
      { owner: 'baseline', id: 'avoid-deep-relative-imports' },
      { owner: 'bun-parse', id: 'bun-parse-json' },
      { owner: 'database', id: 'database-boundary' },
      { owner: 'playwright', id: 'playwright-e2e' },
    ]);
    expect(hints.every((hint) => hint.kind === 'document')).toBe(true);
    expect(
      (await collectPresetDiagnosticHints(activated.slice(2, 3), selected))
        .filter((hint) => hint.kind === 'document')
        .map(({ owner, id }) => ({ owner, id })),
    ).toEqual([{ owner: 'database', id: 'database-boundary' }]);
    expect(
      await collectPresetDiagnosticHints(activated, [
        { ...diagnostic('other-rule'), message: 'database/dao-boundaries' },
      ]),
    ).toEqual([]);
  });
});
