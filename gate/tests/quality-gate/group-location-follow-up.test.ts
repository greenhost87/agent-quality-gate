import { existsSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Diagnostic } from '../../execute-verify/check-result.js';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '../../quality-gate-run/present-diagnostics.js';
import { followUpForSettledResult } from '../../quality-gate-run/quality-gate-run.js';
import {
  buildPathPrefixDictionary,
  collectDiagnosticPaths,
  expandPath,
  shortenPath,
} from '../../quality-gate-run/path-prefixes.js';
import { useExecuteVerifyProjects } from '../../../tests/support/execute-verify-fixture.js';

const { makeTempDirectory } = useExecuteVerifyProjects();

function groupedDiagnostics(severity: 'warning' | 'error'): Diagnostic[] {
  return Array.from({ length: 12 }, (_, index) => ({
    source: 'sample',
    ruleId: 'sample/review',
    severity,
    message: '',
    location: { path: `src/features/long-feature-directory/editor/part-${String(index)}.tsx` },
    groupHeader: 'review owner',
    groupLocation: { path: 'src/features/long-feature-directory/editor/view.tsx' },
    related: [{ path: 'src/features/long-feature-directory/editor/view.tsx', role: 'owner' }],
  }));
}

for (const severity of ['warning', 'error'] as const) {
  test(`shared-location warnings follow ordinary groups without reordering errors (${severity})`, () => {
    const sample = groupedDiagnostics(severity)[0];
    if (sample === undefined) throw new Error('Missing group fixture');
    const grouped: Diagnostic = { ...sample, location: { path: 'a.ts' } };
    const ordinary: Diagnostic = {
      source: 'sample',
      severity: 'warning',
      message: 'ordinary',
      location: { path: 'z.ts' },
    };
    const blocks = groupDiagnosticsForPresentation([grouped, ordinary]);
    expect(blocks.map((block) => block.diagnostics[0]?.location?.path)).toEqual(
      severity === 'warning' ? ['z.ts', 'a.ts'] : ['a.ts', 'z.ts'],
    );
  });
}

test('shared group locations shorten with a reversible, profitable path dictionary', () => {
  const diagnostics = groupedDiagnostics('error');
  const paths = collectDiagnosticPaths(diagnostics);
  const dictionary = buildPathPrefixDictionary(paths);
  const full = renderDiagnosticBlocks(groupDiagnosticsForPresentation(diagnostics));
  const compact = renderDiagnosticBlocks(
    groupDiagnosticsForPresentation(diagnostics, (path) => shortenPath(path, dictionary.aliases)),
  );
  expect(`${dictionary.legend}${compact}`.length).toBeLessThan(full.length);
  expect(compact).toContain('review owner @p');
  for (const path of paths)
    expect(expandPath(shortenPath(path, dictionary.aliases), dictionary.aliases)).toBe(path);
});

test('owner-provided hints are materialized once with compact group locations', async () => {
  const projectRoot = await makeTempDirectory('group-location-hints-');
  const message = await followUpForSettledResult({
    kind: 'ran',
    projectRoot,
    result: {
      exitCode: 1,
      diagnostics: groupedDiagnostics('error'),
      hints: [{ kind: 'builtin', id: 'avoid-micro-splits' }],
    },
  });
  expect(message?.match(/hint:avoid-micro-splits/gu)).toHaveLength(1);
  expect(message).toContain('review owner');
  expect(message).toContain('part-0.tsx');
  expect(existsSync(join(projectRoot, '.aqg/hints/avoid-micro-splits.md'))).toBe(true);
});
