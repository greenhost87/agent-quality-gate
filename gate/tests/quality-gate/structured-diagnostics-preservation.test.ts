import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';

import {
  failedCheckResult,
  mergeCheckResults,
  type Diagnostic,
} from '../../execute-verify/check-result.js';
import { checkResultFromFallowCyclesToolRun } from '../../execute-verify/fallow-json-diagnostics.js';
import { checkResultFromOxlintToolRun } from '../../execute-verify/verify-tool-run.js';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '../../quality-gate-run/present-diagnostics.js';
import { presentStructuredDiagnostics } from '../../quality-gate-run/present-verify-failure.js';
import {
  buildPathPrefixDictionary,
  collectDiagnosticPaths,
  expandPath,
  shortenPath,
} from '../../quality-gate-run/path-prefixes.js';

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    }),
  );
});

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
    expect(text).toContain(`https://example.org/${name}`);
    expect(text).toContain(`src/${name}.ts:1:2`);
    expect(text).toContain(`src/${name}.ts:3:4`);
  }
  expect(text).toContain('check the declaration');
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

  it('R11: a single oversized block stays in-band without an alias legend', async () => {
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
    const presented = await presentStructuredDiagnostics(root, { diagnostics }, 80);
    expect(presented.text).toBe(render(diagnostics));
    expect(presented.text).not.toContain('Path prefixes');
    expect(presented.spillPath).toBeUndefined();
  });

  it('F2: singleton and grouped Oxlint labels, roles and rule URLs survive rendering', () => {
    const diagnostics = labeledDiagnostics();
    expect(diagnostics).toHaveLength(2);
    expectDetails(render(diagnostics.slice(0, 1)), ['a']);
    expectDetails(render(diagnostics), ['a', 'b']);
    expectDetails(
      render(diagnostics.map((entry) => ({ ...entry, groupHeader: 'shared header' }))),
      ['a', 'b'],
    );
  });

  it('F2: compact groups retain primary labels and shared or distinct URLs', () => {
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
      expect(text).toContain('https://example.org/shared');
      const distinct = render(diagnostics.map((entry) => ({ ...entry, groupHeader })));
      expect(distinct).toContain('https://example.org/a');
      expect(distinct).toContain('https://example.org/b');
    }
  });

  it('F2/F3: a single oversized block retains labels, URLs and every execution failure in-band', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aqg-preserve-single-block-'));
    temporaryRoots.push(root);
    const result = mergeCheckResults(
      failedCheckResult(2, 'first failure'),
      { exitCode: 1, diagnostics: labeledDiagnostics() },
      failedCheckResult(3, 'second failure'),
    );
    const presented = await presentStructuredDiagnostics(root, result, 80);
    expect(presented.spillPath).toBeUndefined();
    expect(presented.text.length).toBeGreaterThan(80);
    expectDetails(presented.text, ['a', 'b']);
    expect(presented.text).toContain('first failure');
    expect(presented.text).toContain('second failure');
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
});
