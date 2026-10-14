import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { createBenchRuleContext } from 'agent-quality-gate/testing/oxlint';
import { requireCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';
import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/baseline/tests/support/expect-typed-visitors.ts';

import { noRuntimeInTypesFilesBench } from './bench.ts';
describe('no-runtime-in-types-files visitors', () => {
  itRegistersTypedVisitors(noRuntimeInTypesFilesBench.rule, noRuntimeInTypesFilesBench.ruleId, [
    'Program',
  ]);

  it('skips non-type files without scanning', () => {
    const createOnce = requireCreateOnceRule(noRuntimeInTypesFilesBench.rule);
    const context = createBenchRuleContext(noRuntimeInTypesFilesBench.ruleId);
    context.state.filename = '/bench/file.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
    expect(context.state.reports).toEqual([]);
  });
});

describe('no-runtime-in-types-files reports', () => {
  it('reports runtime leaks on hot-types-file', () => {
    const result = replayCreateOnceRule({
      ruleId: noRuntimeInTypesFilesBench.ruleId,
      rule: noRuntimeInTypesFilesBench.rule,
      cases: noRuntimeInTypesFilesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT * 2);
    expect(reports.every((report) => report.messageId === 'invalid')).toBe(true);
  });
});
