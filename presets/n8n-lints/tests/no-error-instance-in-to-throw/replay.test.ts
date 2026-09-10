import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { noErrorInstanceInToThrowBench } from './bench.ts';

describe('no-error-instance-in-to-throw visitors', () => {
  itRegistersTypedVisitors(
    noErrorInstanceInToThrowBench.rule,
    noErrorInstanceInToThrowBench.ruleId,
    ['CallExpression'],
  );
});

describe('no-error-instance-in-to-throw reports', () => {
  it('reports once per error instance on hot-instances', () => {
    const result = replayCreateOnceRule({
      ruleId: noErrorInstanceInToThrowBench.ruleId,
      rule: noErrorInstanceInToThrowBench.rule,
      cases: noErrorInstanceInToThrowBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'noErrorInstance')).toBe(true);
  });

  it('reports rejects.toThrowError with an instance', () => {
    const result = replayCreateOnceRule({
      ruleId: noErrorInstanceInToThrowBench.ruleId,
      rule: noErrorInstanceInToThrowBench.rule,
      cases: [
        {
          name: 'rejects-instance',
          filename: '/bench/rejects.test.ts',
          code: 'await expect(run()).rejects.toThrowError(new TypeError("bad"));',
        },
      ],
    });
    expect(result.cases[0]?.reports.map((report) => report.messageId)).toEqual(['noErrorInstance']);
  });

  it('allows class, message, and unrelated matchers', () => {
    const result = replayCreateOnceRule({
      ruleId: noErrorInstanceInToThrowBench.ruleId,
      rule: noErrorInstanceInToThrowBench.rule,
      cases: [
        {
          name: 'class-form',
          filename: '/bench/class-form.test.ts',
          code: 'expect(run()).toThrow(TypeError);',
        },
        {
          name: 'message-form',
          filename: '/bench/message-form.test.ts',
          code: "expect(run()).toThrow('bad');",
        },
        {
          name: 'unrelated',
          filename: '/bench/unrelated.test.ts',
          code: 'expect(run()).toBe(1);',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
    expect(result.cases[1]?.reports).toEqual([]);
    expect(result.cases[2]?.reports).toEqual([]);
  });
});
