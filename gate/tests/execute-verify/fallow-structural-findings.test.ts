import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

import { checkFallowStructuralFindings } from '../../execute-verify/fallow-structural-findings.ts';
import { emptyCheckResult, type Diagnostic } from '../../execute-verify/check-result.ts';
import { runNodeProcess } from '../../../process/run-node-tool/run-node-tool.ts';
import { useExecuteVerifyProjects } from '../../../tests/support/execute-verify-fixture.ts';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.ts';
import { executeVerify, type ToolRunResult } from '../../execute-verify/execute-verify.ts';
import {
  groupDiagnosticsForPresentation,
  renderDiagnosticBlocks,
} from '../../quality-gate-run/present-diagnostics.ts';

useIsolatedAgentQualityGateHome();
const { makeTempDirectory } = useExecuteVerifyProjects();
const fixtureRoot = join(import.meta.dir, '../../.quality-fixtures/react-structural');

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

function emptyFallowJson(args: readonly string[]): string {
  if (args.includes('--complexity')) return '{"kind":"health","findings":[]}';
  if (args.includes('--skip'))
    return '{"kind":"combined","check":{"total_issues":0},"dupes":{"clone_groups":[]}}';
  return '{"kind":"dead-code","total_issues":0}';
}

function present(result: { diagnostics: readonly Diagnostic[] }): string {
  return renderDiagnosticBlocks(groupDiagnosticsForPresentation(result.diagnostics));
}

test('actual Fallow findings gate even when upstream exits zero', async () => {
  const { root, config } = await project();
  const result = await checkFallowStructuralFindings(runNodeProcess, root, config);
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
        if (severity === 'warn' && options.args.includes('--re-export-cycles')) {
          const config = options.args[options.args.indexOf('--config') + 1];
          if (config === undefined) throw new Error('Missing Fallow config');
          const text = await readFile(config, 'utf8');
          await writeFile(
            config,
            text.replace('"prop-drilling": "error"', '"prop-drilling": "warn"'),
          );
        }
        if (options.name === 'oxlint') return output('{"diagnostics":[]}');
        if (
          options.name === 'fallow' &&
          options.args.includes('dead-code') &&
          !options.args.includes('--re-export-cycles') &&
          !options.args.includes('--boundary-violations')
        ) {
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

test('warn is visible without failing and off does not start analysis', async () => {
  const warning = await project('warn');
  const result = await checkFallowStructuralFindings(runNodeProcess, warning.root, warning.config);
  expect(result.exitCode).toBe(0);
  expect(present(result)).toContain('warning fallow/prop-drilling');
  const disabled = await project('off');
  let calls = 0;
  await checkFallowStructuralFindings(
    async () => {
      calls += 1;
      return await Promise.resolve(output(''));
    },
    disabled.root,
    disabled.config,
  );
  expect(calls).toBe(0);
});

test('empty structural arrays pass and malformed output fails closed', async () => {
  const { root, config } = await project();
  const clean = await checkFallowStructuralFindings(
    async () => Promise.resolve(output('{"kind":"dead-code","total_issues":0}')),
    root,
    config,
  );
  expect(clean).toEqual(emptyCheckResult());
  for (const invalid of ['{}', '{"kind":"dead-code"}']) {
    expect(
      checkFallowStructuralFindings(async () => Promise.resolve(output(invalid)), root, config),
    ).rejects.toThrow('invalid JSON');
  }
});

test('all three structural arrays produce located diagnostics independently of total_issues', async () => {
  const { root, config } = await project();
  const text = await readFile(
    join(import.meta.dir, 'fixtures/fallow-structural-findings.json'),
    'utf8',
  );
  const result = await checkFallowStructuralFindings(
    async () => Promise.resolve(output(text)),
    root,
    config,
  );
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

test('process failure is retained instead of interpreted as no findings', async () => {
  const { root, config } = await project();
  const result = await checkFallowStructuralFindings(
    async () => Promise.resolve({ exitCode: 2, stdout: '', stderr: 'analyzer crashed' }),
    root,
    config,
  );
  expect(result.exitCode).toBe(2);
  expect(result.failures?.[0]?.message).toBe('analyzer crashed');
});
