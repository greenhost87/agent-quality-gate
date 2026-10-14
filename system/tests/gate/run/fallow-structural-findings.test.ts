import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import {
  readStructuralSeverityRules,
  structuralCheckResultFromCombinedToolRun,
  structuralRulesAllOff,
} from '#system/gate/run/fallow/structural-findings.ts';
import { fallowToolRun } from '#system/gate/run/fallow/tool-run.ts';
import { emptyCheckResult, type Diagnostic } from '#system/gate/run/check-result.ts';
import { runNodeProcess } from '#system/process/run-node-tool/run-node-tool.ts';
import { useExecuteVerifyProjects } from '#system/tests/support/execute-verify-fixture.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import { executeVerify, type ToolRunResult } from '#system/gate/run/execute-verify.ts';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '#system/gate/quality-gate-run/present-diagnostics.ts';
import { configArgOf, fallowPhase } from './verify-phases-helpers.ts';

useIsolatedAgentQualityGateHome();
const { makeTempDirectory } = useExecuteVerifyProjects();
const fixtureRoot = join(
  import.meta.dir,
  '../../../../system/tests/gate/.quality-fixtures/react-structural',
);

async function project(severity: 'off' | 'warn' | 'error' = 'error') {
  const root = await makeTempDirectory('react-structural-');
  await cp(fixtureRoot, root, { recursive: true });
  const config = join(root, 'fallow.json');
  await writeFile(
    config,
    JSON.stringify({
      entry: ['forwarding.tsx'],
      rules: {
        'prop-drilling': severity,
        'thin-wrapper': severity,
        'duplicate-prop-shape': severity,
      },
    }),
  );
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'react-structural-probe',
      private: true,
      dependencies: { react: '*' },
    }),
  );
  return { root, config };
}

function output(stdout: string): ToolRunResult {
  return { exitCode: 0, stdout, stderr: '' };
}

function emptyCombinedJson(): string {
  return '{"kind":"combined","check":{"total_issues":0},"dupes":{"clone_groups":[]},"health":{"findings":[]}}';
}

function emptyFallowJson(args: readonly string[]): string {
  if (fallowPhase(args) === 'combined') {
    return emptyCombinedJson();
  }
  if (fallowPhase(args) === 'dupes' || fallowPhase(args) === 'second') {
    return '{"kind":"combined","dupes":{"clone_groups":[]}}';
  }
  return '{"kind":"dead-code","total_issues":0}';
}

function rules(severity: 'off' | 'warn' | 'error' = 'error') {
  return {
    'prop-drilling': severity,
    'thin-wrapper': severity,
    'duplicate-prop-shape': severity,
  } as const;
}

function present(result: { diagnostics: readonly Diagnostic[] }): string {
  return renderDiagnosticBlocks(groupDiagnosticsForPresentation(result.diagnostics));
}

test('actual Fallow findings gate even when upstream exits zero', async () => {
  const { root, config } = await project();
  const raw = await runNodeProcess(fallowToolRun(root, config, ['--fail-on-issues'], 'json'));
  const result = structuralCheckResultFromCombinedToolRun(raw, rules());
  expect(result.exitCode).toBe(1);
  const text = present(result);
  expect(text).toContain('fallow/prop-drilling');
  expect(text).toContain('DirectSource -> DirectMiddle -> DirectEnd');
  expect(text).toContain('RenamedSource -> RenamedMiddle -> RenamedEnd');
  expect(text).toContain('ModelSource -> ModelMiddle -> ModelEnd');
  expect(text).not.toContain('ComputedSource');
  expect(text).not.toContain('FunctionSource');
  expect(text).not.toContain('SetterSource');
});

for (const severity of ['error', 'warn'] as const) {
  test(`verify retains structural ${severity} findings and success status when appropriate`, async () => {
    const { root } = await project();
    const result = await executeVerify(
      {
        projectRoot: root,
        entries: ['forwarding.tsx'],
        skipPresetProjectChecks: true,
      },
      async (options) => {
        if (severity === 'warn' && options.name === 'fallow') {
          // The single shared combined run carries the structural rules:
          // downgrade prop-drilling there instead of a dedicated cycles spawn.
          const config = configArgOf(options);
          if (config === undefined) throw new Error('Missing Fallow config');
          const text = await readFile(config, 'utf8');
          await writeFile(
            config,
            text.replace('"prop-drilling": "error"', '"prop-drilling": "warn"'),
          );
        }
        if (options.name === 'oxlint') return output('{"diagnostics":[]}');
        if (options.name === 'fallow' && fallowPhase(options.args) === 'combined') {
          return runNodeProcess(options);
        }
        return output(options.name === 'fallow' ? emptyFallowJson(options.args) : '');
      },
    );
    expect(result.exitCode).toBe(severity === 'error' ? 1 : 0);
    expect(present(result)).toContain('fallow/prop-drilling');
    if (severity === 'warn') {
      expect(present(result)).toContain('warning fallow/prop-drilling');
      expect(result.statusStdout).toContain('verify: ok');
    }
  });
}

test('warn is visible without failing and off short-circuits before analysis', async () => {
  const warning = await project('warn');
  const warningRules = await readStructuralSeverityRules(warning.config);
  expect(structuralRulesAllOff(warningRules)).toBe(false);
  const raw = await runNodeProcess(
    fallowToolRun(warning.root, warning.config, ['--fail-on-issues'], 'json'),
  );
  const result = structuralCheckResultFromCombinedToolRun(raw, warningRules);
  expect(result.exitCode).toBe(0);
  expect(present(result)).toContain('warning fallow/prop-drilling');
  const disabled = await project('off');
  const disabledRules = await readStructuralSeverityRules(disabled.config);
  expect(structuralRulesAllOff(disabledRules)).toBe(true);
});

test('empty structural arrays pass and malformed output fails closed', () => {
  const clean = structuralCheckResultFromCombinedToolRun(output(emptyCombinedJson()), rules());
  expect(clean).toEqual(emptyCheckResult());
  for (const invalid of ['{}', '{"check":{}}']) {
    const result = structuralCheckResultFromCombinedToolRun(output(invalid), rules());
    expect(result.exitCode).toBe(1);
    expect(result.failures?.[0]?.message ?? '').toContain('invalid JSON');
  }
});

test('positive total_issues without findings is a protocol failure', () => {
  const result = structuralCheckResultFromCombinedToolRun(
    output(
      '{"kind":"combined","check":{"total_issues":1},"dupes":{"clone_groups":[]},"health":{"findings":[]}}',
    ),
    rules(),
  );
  expect(result.exitCode).toBe(1);
  expect(result.diagnostics).toEqual([]);
  expect(result.failures?.[0]?.message ?? '').toContain(
    'total_issues without recognizable findings',
  );
});

test('positive total_issues with non-structural findings is ignored by structural check', () => {
  const result = structuralCheckResultFromCombinedToolRun(
    output(
      JSON.stringify({
        kind: 'combined',
        check: {
          total_issues: 1,
          unused_exports: [{ path: 'src/unused.ts', export_name: 'unused' }],
        },
        dupes: { clone_groups: [] },
        health: { findings: [] },
      }),
    ),
    rules(),
  );
  expect(result).toEqual(emptyCheckResult());
});

test('all three structural arrays produce located diagnostics independently of total_issues', async () => {
  const text = await readFile(
    join(import.meta.dir, 'fixtures/fallow-structural-findings.json'),
    'utf8',
  );
  const result = structuralCheckResultFromCombinedToolRun(output(text), rules());
  expect(result.exitCode).toBe(1);
  const presented = present(result);
  for (const expected of [
    'app/title.tsx:3',
    'fallow/prop-drilling',
    'app/wrapper.tsx:7',
    'fallow/thin-wrapper',
    'app/select.tsx:11',
    'fallow/duplicate-prop-shape',
  ]) {
    expect(presented).toContain(expected);
  }
});

test('process failure is retained instead of interpreted as no findings', () => {
  const result = structuralCheckResultFromCombinedToolRun(
    { exitCode: 2, stdout: '', stderr: 'analyzer crashed' },
    rules(),
  );
  expect(result.exitCode).toBe(2);
  expect(result.failures?.[0]?.message).toBe('analyzer crashed');
});
