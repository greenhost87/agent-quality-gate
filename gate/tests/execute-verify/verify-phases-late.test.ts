import { describe, expect, it } from 'bun:test';

import { executeVerify } from '../../execute-verify/execute-verify.js';
import { VERIFY_TIMING_ENV } from '../../execute-verify/verify-timing.js';
import { setEnv } from '../../read-env/read-env.js';
import { useIsolatedAgentQualityGateHome } from '../../../tests/support/isolated-home.js';
import {
  EXECUTE_VERIFY_FIXTURE_ENTRIES,
  useExecuteVerifyProjects,
} from '../../../tests/support/execute-verify-fixture.js';
import { verifyPresentedText } from '../../../tests/support/verify-result-text.js';
import { emptyFallowJson, emptyToolResult, fallowPhase } from './verify-phases-helpers.js';

useIsolatedAgentQualityGateHome();
const { createTypeScriptProject, runVerify } = useExecuteVerifyProjects();

describe('verify phases late failures', () => {
  it('reports a hygiene failure before a complexity failure when both phases run', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    const phases: string[] = [];
    const result = await executeVerify(
      {
        projectRoot: cwd,
        entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
        skipPresetProjectChecks: true,
      },
      async (options) => {
        await Promise.resolve();
        if (options.name === 'fallow') {
          phases.push(fallowPhase(options.args));
        }
        if (options.name === 'fallow' && fallowPhase(options.args) === 'hygiene') {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              kind: 'combined',
              check: {
                total_issues: 1,
                unused_exports: [{ path: 'src/dead.ts', export_name: 'dead', line: 1, col: 0 }],
              },
              dupes: { clone_groups: [] },
            }),
            stderr: '',
          };
        }
        return emptyToolResult(options.args, options.name);
      },
    );
    expect(result.exitCode).toBe(1);
    expect(verifyPresentedText(result)).toContain('unused-export');
    expect(phases[0]).toBe('cycles');
    expect(new Set(phases.slice(1))).toEqual(
      new Set(['boundaries', 'structural', 'hygiene', 'complexity']),
    );
    expect(phases).toHaveLength(5);
  });

  it('writes phase timings under the new phase names when VERIFY_TIMING is set', async () => {
    const cwd = await createTypeScriptProject('clean-function/src/index.ts');
    setEnv(VERIFY_TIMING_ENV, '1');
    try {
      const result = await executeVerify(
        {
          projectRoot: cwd,
          entries: EXECUTE_VERIFY_FIXTURE_ENTRIES,
          skipPresetProjectChecks: true,
        },
        async (options) => {
          await Promise.resolve();
          return {
            exitCode: 0,
            stdout:
              options.name === 'fallow' ? emptyFallowJson(options.args) : '{"diagnostics":[]}',
            stderr: '',
          };
        },
      );
      expect(result.statusStderr?.includes('verify-timing: fallow-cycles=')).toBe(true);
      expect(result.statusStderr?.includes('fallow-boundaries=')).toBe(true);
      expect(result.statusStderr?.includes('oxlint=')).toBe(true);
      expect(result.statusStderr?.includes('fallow-hygiene=')).toBe(true);
      expect(result.statusStderr?.includes('fallow-complexity=')).toBe(true);
      expect(result.statusStderr?.includes('verify-timing: total=')).toBe(true);
    } finally {
      setEnv(VERIFY_TIMING_ENV, undefined);
    }
  });

  it('fails a self-reexport cycle without type-aware diagnostics', async () => {
    const cwd = await createTypeScriptProject('circular-self-reexport/src/index.ts');
    const started = performance.now();
    const result = await runVerify(cwd);
    const output = verifyPresentedText(result);
    expect(performance.now() - started).toBeLessThan(15_000);
    expect(result.exitCode).toBe(1);
    expect(output.includes('typescript(no-unsafe-') || output.includes('typescript(TS')).toBe(
      false,
    );
    expect(output.includes('re-export-cycle') || output.includes('circular')).toBe(true);
  });

  it('fails high cyclomatic complexity without git health noise', async () => {
    const cwd = await createTypeScriptProject('high-complexity/src/index.ts');
    const result = await runVerify(cwd);
    const output = verifyPresentedText(result);
    expect(result.exitCode).toBe(1);
    expect(output.toLowerCase().includes('complexity')).toBe(true);
    expect(output.includes('hotspot:')).toBe(false);
    expect(output.includes('vital-signs:')).toBe(false);
  });
});
