import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import {
  failedCheckResult,
  mergeCheckResults,
  type Diagnostic,
} from '#system/gate/run/check-result.ts';
import { checkResultFromFallowCyclesToolRun } from '#system/gate/run/fallow/json-diagnostics.ts';
import { checkResultFromOxlintToolRun } from '#system/gate/run/verify-tool-run.ts';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '#system/gate/quality-gate-run/present-diagnostics.ts';
import {
  presentStructuredDiagnostics,
  VERIFY_FAILURE_LOG_RELATIVE_PATH,
} from '#system/gate/quality-gate-run/present-verify-failure.ts';
import { readTextFile } from '#system/process/files/files.ts';
import {
  buildPathPrefixDictionary,
  collectDiagnosticPaths,
  expandPath,
  shortenPath,
} from '#system/gate/quality-gate-run/path-prefixes.ts';
import { useTrackedTempDirectories } from '#system/tests/support/tracked-temp-directories.ts';

const { tempDirectories: temporaryRoots } = useTrackedTempDirectories();

function render(diagnostics: readonly Diagnostic[]): string {
  return renderDiagnosticBlocks(groupDiagnosticsForPresentation(diagnostics));
}

function labeledDiagnostics(): readonly Diagnostic[] {
  return checkResultFromOxlintToolRun(
    {
      exitCode: 1,
      stderr: '',
      stdout: JSON.stringify({
        diagnostics: ['a', 'b'].map((name) => ({
          severity: 'error',
          code: 'typescript(TS2322)',
          message: 'bad assignment',
          filename: `src/${name}.ts`,
          help: 'check the declaration',
          url: `https://example.org/${name}`,
          labels: [
            { label: `expected string ${name}`, span: { line: 1, column: 2 } },
            { label: `actual number ${name}`, span: { line: 3, column: 4 } },
          ],
        })),
      }),
    },
    new Set(),
  ).diagnostics;
}

function expectDetails(text: string, names: readonly string[]): void {
  for (const name of names) {
    expect(text).toContain(`expected string ${name}`);
    expect(text).toContain(`actual number ${name}`);
    expect(text).not.toContain(`https://example.org/${name}`);
    expect(text).toContain(`src/${name}.ts:1:2`);
    expect(text).toContain(`src/${name}.ts:3:4`);
  }
  expect(text).not.toContain('check the declaration');
  expect(text).toContain('[label]');
}

describe('structured diagnostic presentation preservation', () => {
  it('R10: group locations use the owner-provided header without rule-specific formatting', () => {
    const diagnostic: Diagnostic = {
      source: 'sample',
      ruleId: 'sample/ownership',
      severity: 'error',
      message: 'review ownership',
      location: { path: 'src/child.ts' },
      related: [{ path: 'src/owner.ts', role: 'owner' }],
      groupHeader: 'owner',
      groupLocation: { path: 'src/owner.ts' },
    };
    expect(render([diagnostic])).toContain('owner src/owner.ts');
    expect(render([{ ...diagnostic, groupHeader: 'translated heading' }])).toContain(
      'translated heading src/owner.ts',
    );
    expect(collectDiagnosticPaths([{ ...diagnostic, related: [] }])).toContain('src/owner.ts');
  });

  it('R10: related coordinates and labels survive compact grouping', () => {
    const diagnostics: Diagnostic[] = ['a', 'b'].map((name) => ({
      source: 'sample',
      ruleId: 'sample/ownership',
      severity: 'error',
      message: 'review ownership',
      groupHeader: 'owner',
      groupLocation: { path: 'src/owner.ts' },
      location: { path: `src/${name}.ts` },
      related: [
        { path: 'src/owner.ts', line: 7, column: 2, label: `import ${name}`, role: 'importer' },
      ],
    }));
    for (const entries of [diagnostics, diagnostics.slice(0, 1)]) {
      const text = render(entries);
      for (const diagnostic of entries) {
        expect(text).toContain(diagnostic.related?.[0]?.label ?? 'missing');
      }
      expect(text).toContain('src/owner.ts:7:2');
    }
  });

  it('R10: tied locations render deterministically and do not merge different severities', () => {
    const diagnostics: Diagnostic[] = ['first', 'second'].map((help) => ({
      source: 'test',
      ruleId: 'rule',
      severity: 'error',
      message: 'same',
      location: { path: 'src/a.ts' },
      help,
      groupHeader: 'shared',
    }));
    expect(render(diagnostics)).toBe(render([...diagnostics].reverse()));
    const blocks = groupDiagnosticsForPresentation(
      diagnostics.map((diagnostic, index) => ({
        ...diagnostic,
        severity: index === 0 ? 'error' : 'warning',
      })),
    );
    expect(blocks).toHaveLength(2);
  });

  it('R11: a single oversized block spills between findings without an alias legend', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aqg-full-path-metadata-'));
    temporaryRoots.push(root);
    const diagnostics: Diagnostic[] = Array.from({ length: 8 }, (_, index) => ({
      source: 'test',
      ruleId: 'rule',
      severity: 'error',
      message: 'detail'.repeat(60),
      location: {
        path: `app/components/features/very-long-feature-directory/item-${String(index)}.tsx`,
      },
    }));
    const presented = await presentStructuredDiagnostics(root, { diagnostics }, 1);
    expect(presented.text).toContain(`other errors: ${VERIFY_FAILURE_LOG_RELATIVE_PATH}`);
    expect(presented.text.split('\n').length).toBeLessThanOrEqual(1);
    expect(presented.text).not.toContain('Path prefixes');
    expect(presented.spillPath).toBe(VERIFY_FAILURE_LOG_RELATIVE_PATH);
    expect(presented.full).toBe(render(diagnostics));
    const logged = await readTextFile(join(root, VERIFY_FAILURE_LOG_RELATIVE_PATH));
    expect(logged).toContain('item-0.tsx');
    expect(logged).toContain('item-7.tsx');
    expect(logged).toContain('detail');
  });

  it('compacts repeated point locations in one file without repeating the path', async () => {
    const diagnostics: Diagnostic[] = [
      [8, 20],
      [34, 43],
      [35, 43],
    ].map(([line, column]) => ({
      source: 'oxlint',
      ruleId: 'aqg/no-inline-multiline-test-data',
      severity: 'error',
      message: 'Do not embed multi-line test data.',
      location: {
        path: 'tests/extensions/context-gatherer/context-gatherer.test.ts',
        line,
        column,
      },
    }));

    const expected = await readTextFile(
      join(import.meta.dir, '..', 'fixtures', 'repeated-point-locations-expected.txt'),
    );
    expect(render(diagnostics)).toBe(expected.trimEnd());
  });

  it('F2: singleton and grouped Oxlint labels and roles survive rendering without help or rule URLs', () => {
    const diagnostics = labeledDiagnostics();
    expect(diagnostics).toHaveLength(2);
    expectDetails(render(diagnostics.slice(0, 1)), ['a']);
    expectDetails(render(diagnostics), ['a', 'b']);
    expectDetails(
      render(diagnostics.map((entry) => ({ ...entry, groupHeader: 'shared header' }))),
      ['a', 'b'],
    );
  });

  it('F2: compact groups retain primary labels and omit rule URLs', () => {
    const diagnostics = labeledDiagnostics().map((entry) => ({ ...entry, related: [] }));
    for (const groupHeader of [undefined, 'shared header']) {
      const entries = diagnostics.map((entry) => ({
        ...entry,
        groupHeader,
        url: 'https://example.org/shared',
      }));
      const text = render(entries);
      expect(text).toContain('expected string a');
      expect(text).toContain('expected string b');
      expect(text).not.toContain('https://example.org/shared');
      const distinct = render(diagnostics.map((entry) => ({ ...entry, groupHeader })));
      expect(distinct).toContain('expected string a');
      expect(distinct).toContain('expected string b');
      expect(distinct).not.toContain('https://example.org/a');
      expect(distinct).not.toContain('https://example.org/b');
      expect(distinct).toBe(text);
    }
  });

  it('compacts repeated divergent rule details and omits help and rule URLs', () => {
    const url = 'https://example.org/prefer-tag-over-role';
    const diagnostics: Diagnostic[] = [
      ['src/a.tsx', 'Prefer output.', 'Replace status with output.'],
      ['src/b.tsx', 'Prefer output.', 'Replace status with output.'],
      ['src/c.tsx', 'Prefer progress.', 'Replace progressbar with progress.'],
    ].map(([path, message, help]) => ({
      source: 'oxlint',
      ruleId: 'jsx-a11y/prefer-tag-over-role',
      severity: 'error',
      message: message ?? '',
      help,
      url,
      location: { path: path ?? '', line: 1, column: 2 },
    }));

    const text = render(diagnostics);
    expect(text).toContain('src/a.tsx:1:2, src/b.tsx:1:2: Prefer output.');
    expect(text.match(/Prefer output\./gu)).toHaveLength(1);
    expect(text).not.toContain('Replace status with output.');
    expect(text).not.toContain(url);
    expect(text).toContain('src/c.tsx:1:2: Prefer progress.');
    expect(text).not.toContain('Replace progressbar with progress.');
  });

  it('F2/F3: a single oversized block retains labels and every execution failure across head and spill', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aqg-preserve-single-block-'));
    temporaryRoots.push(root);
    const result = mergeCheckResults(
      failedCheckResult(2, 'first failure'),
      { exitCode: 1, diagnostics: labeledDiagnostics() },
      failedCheckResult(3, 'second failure'),
    );
    const presented = await presentStructuredDiagnostics(root, result, 5);
    expect(presented.text.split('\n').length).toBeLessThanOrEqual(5);
    expect(presented.spillPath).toBe(VERIFY_FAILURE_LOG_RELATIVE_PATH);
    expect(presented.full).toContain('first failure');
    expect(presented.full).toContain('second failure');
    expectDetails(presented.full ?? '', ['a', 'b']);
    expectDetails(presented.text, ['a']);
    const logged = await readTextFile(join(root, VERIFY_FAILURE_LOG_RELATIVE_PATH));
    expectDetails(logged, ['b']);
    expect(logged).not.toContain('src/a.ts');
  });

  it('F4: cycle output shortens every path and retains separate ordered chains', () => {
    const prefix = 'app/components/features/very-long-feature-directory';
    const cycles = [
      ['z', 'a', 'm'],
      ['n', 'b', 'c'],
    ].map((names) => ({ files: names.map((name) => `${prefix}/${name}.ts`) }));
    const result = checkResultFromFallowCyclesToolRun({
      exitCode: 1,
      stderr: '',
      stdout: JSON.stringify({ kind: 'dead-code', circular_dependencies: cycles }),
    });
    const paths = collectDiagnosticPaths(result.diagnostics);
    const dictionary = buildPathPrefixDictionary(paths);
    expect(dictionary.aliases.length).toBeGreaterThan(0);
    const text = renderDiagnosticBlocks(
      groupDiagnosticsForPresentation(result.diagnostics, (path) =>
        shortenPath(path, dictionary.aliases),
      ),
    );
    expect(text).not.toContain(prefix);
    for (const path of paths) {
      const shortened = shortenPath(path, dictionary.aliases);
      expect(text).toContain(shortened);
      expect(expandPath(shortened, dictionary.aliases)).toBe(path);
    }
    for (const cycle of cycles) {
      const positions = cycle.files.map((path) =>
        text.indexOf(shortenPath(path, dictionary.aliases)),
      );
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
    }
  });

  it('uses producer-supplied presentation priority ahead of path sorting', () => {
    const diagnostics: Diagnostic[] = [
      {
        source: 'example-check',
        ruleId: 'example-check/consequence',
        severity: 'error',
        message: 'consequence first by path, but later by priority',
        presentationOrder: 1,
        location: { path: 'a.ts', line: 1 },
      },
      {
        source: 'example-check',
        ruleId: 'example-check/cause',
        severity: 'error',
        message: 'cause first by priority',
        presentationOrder: 0,
        location: { path: 'z.ts', line: 1 },
      },
    ];
    const blocks = groupDiagnosticsForPresentation(diagnostics);
    expect(blocks.map((block) => block.diagnostics[0]?.ruleId)).toEqual([
      'example-check/cause',
      'example-check/consequence',
    ]);
  });
});
