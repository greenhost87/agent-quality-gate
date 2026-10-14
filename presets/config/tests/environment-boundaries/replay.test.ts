import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { createBenchRuleContext } from 'agent-quality-gate/testing/oxlint';
import { requireCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/testing/oxlint';

import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/config/tests/support/expect-typed-visitors.ts';
import { environmentBoundariesBench } from './bench.ts';

describe('environment-boundaries visitors', () => {
  itRegistersTypedVisitors(environmentBoundariesBench.rule, environmentBoundariesBench.ruleId, [
    'AssignmentExpression',
    'MemberExpression',
    'VariableDeclarator',
  ]);

  it('skips the environment module without scanning', () => {
    const createOnce = requireCreateOnceRule(environmentBoundariesBench.rule);
    const context = createBenchRuleContext(environmentBoundariesBench.ruleId);
    context.state.filename = '/bench/system/config/environment.ts';
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
    expect(context.state.reports).toEqual([]);
  });
});

describe('environment-boundaries reports', () => {
  it('reports once per process.env read on hot-process-env', () => {
    const result = replayCreateOnceRule({
      ruleId: environmentBoundariesBench.ruleId,
      rule: environmentBoundariesBench.rule,
      cases: environmentBoundariesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'environment')).toBe(true);
  });

  it('skips the environment module', () => {
    const result = replayCreateOnceRule({
      ruleId: environmentBoundariesBench.ruleId,
      rule: environmentBoundariesBench.rule,
      cases: [
        {
          name: 'env-module',
          filename: '/bench/system/config/environment.ts',
          cwd: '/bench',
          code: 'export const token = process.env.TOKEN;\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });

  it('skips a configured environment module instead of the default path', () => {
    const result = replayCreateOnceRule({
      ruleId: environmentBoundariesBench.ruleId,
      rule: environmentBoundariesBench.rule,
      cases: [
        {
          name: 'configured-env-module',
          filename: '/bench/src/server/config/environment.ts',
          cwd: '/bench',
          code: 'export const token = process.env.TOKEN;\n',
          options: [{ environmentPath: 'src/server/config/environment.ts' }],
        },
        {
          name: 'default-env-module',
          filename: '/bench/system/config/environment.ts',
          cwd: '/bench',
          code: 'export const token = process.env.TOKEN;\n',
          options: [{ environmentPath: 'src/server/config/environment.ts' }],
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
    expect(result.cases[1]?.reports).toHaveLength(1);
  });

  it('allows only NEXT_RUNTIME in instrumentation.ts', () => {
    const result = replayCreateOnceRule({
      ruleId: environmentBoundariesBench.ruleId,
      rule: environmentBoundariesBench.rule,
      cases: [
        {
          name: 'instrumentation-next-runtime',
          filename: '/bench/instrumentation.ts',
          cwd: '/bench',
          code: 'export const runtime = process.env.NEXT_RUNTIME;\n',
        },
        {
          name: 'instrumentation-other-env',
          filename: '/bench/instrumentation.ts',
          cwd: '/bench',
          code: 'export const token = process.env.API_TOKEN;\n',
        },
        {
          name: 'next-runtime-outside',
          filename: '/bench/system/orders/service.ts',
          cwd: '/bench',
          code: 'export const runtime = process.env.NEXT_RUNTIME;\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
    expect(result.cases[1]?.reports).toHaveLength(1);
    expect(result.cases[1]?.reports[0]?.messageId).toBe('environment');
    expect(result.cases[2]?.reports).toHaveLength(1);
    expect(result.cases[2]?.reports[0]?.messageId).toBe('environment');
  });
});
