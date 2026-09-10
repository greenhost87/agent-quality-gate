import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from '../support/hot-code.ts';
import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';

import { noClassBench } from './bench.ts';
describe('no-class visitors', () => {
  itRegistersTypedVisitors(
    noClassBench.rule,
    noClassBench.ruleId,
    ['ClassDeclaration', 'ClassExpression'],
    [{ suffixes: ['Error', 'Element'] }],
  );
});

describe('no-class reports', () => {
  it('reports once per banned class on hot-classes', () => {
    const result = replayCreateOnceRule({
      ruleId: noClassBench.ruleId,
      rule: noClassBench.rule,
      cases: noClassBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'forbidden')).toBe(true);
  });

  it('does not report when options are omitted', () => {
    const result = replayCreateOnceRule({
      ruleId: noClassBench.ruleId,
      rule: noClassBench.rule,
      cases: [
        {
          name: 'disabled',
          filename: '/bench/disabled.ts',
          code: 'export class HashCache {}\n',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
  });
});
