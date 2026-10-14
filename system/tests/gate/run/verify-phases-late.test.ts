import { describe, expect, it } from 'bun:test';

import { VERIFY_TIMING_ENV } from '#system/gate/run/verify-timing.ts';
import { setEnv } from '#system/gate/read-env/read-env.ts';
import { useIsolatedAgentQualityGateHome } from '#system/tests/support/isolated-home.ts';
import {
  runCleanProjectVerify,
  useExecuteVerifyProjects,
} from '#system/tests/support/execute-verify-fixture.ts';
import { expectVerifyFailureText } from '#system/tests/support/verify-assertions.ts';
import { verifyPresentedText } from '#system/tests/support/verify-result-text.ts';
import {
  deadExportCombinedFailureResult,
  emptyToolResult,
  fallowPhase,
  recordFallowPhase,
} from './verify-phases-helpers.js';

useIsolatedAgentQualityGateHome();
const projects = useExecuteVerifyProjects();
const { createTypeScriptProject, runVerify } = projects;

describe('verify phases late failures', () => {
  it('reports a hygiene failure before a complexity failure when both phases run', async () => {
    const phases: string[] = [];
    const { result } = await runCleanProjectVerify(projects, async (options) => {
      await Promise.resolve();
      recordFallowPhase(phases, options);
      if (options.name === 'fallow' && fallowPhase(options.args) === 'combined') {
        return deadExportCombinedFailureResult();
      }
      return emptyToolResult(options.args, options.name);
    });
    expectVerifyFailureText(result, 'unused-export');
    expect(verifyPresentedText(result)).not.toContain('tooComplex');
    expect(phases).toEqual(['combined']);
  });

  it('writes phase timings under the new phase names when VERIFY_TIMING is set', async () => {
    setEnv(VERIFY_TIMING_ENV, '1');
    try {
      const { result } = await runCleanProjectVerify(projects, async (options) => {
        await Promise.resolve();
        return emptyToolResult(options.args, options.name);
      });
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
    expect(performance.now() - started).toBeLessThan(45_000);
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
