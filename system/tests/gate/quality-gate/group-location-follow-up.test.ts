import { existsSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Diagnostic } from '#system/gate/run/check-result.ts';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '#system/gate/quality-gate-run/present-diagnostics.ts';
import { followUpForSettledResult } from '#system/gate/quality-gate-run/quality-gate-run.ts';
import {
  buildPathPrefixDictionary,
  collectDiagnosticPaths,
  expandPath,
  shortenPath,
} from '#system/gate/quality-gate-run/path-prefixes.ts';
import { useExecuteVerifyProjects } from '#system/tests/support/execute-verify-fixture.ts';

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
      hints: [
        {
          kind: 'document',
          id: 'avoid-micro-splits',
          owner: 'project-quality',
          body: '# avoid-micro-splits\n\nKeep focused helpers at their call sites.\n',
        },
      ],
    },
  });
  expect(message?.match(/hint:avoid-micro-splits/gu)).toHaveLength(1);
  expect(message).toContain('review owner');
  expect(message).toContain('part-0.tsx');
  expect(
    existsSync(join(projectRoot, '.aqg/hints/presets/project-quality/avoid-micro-splits.md')),
  ).toBe(true);
});
