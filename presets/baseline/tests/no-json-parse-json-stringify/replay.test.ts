import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from '../support/hot-code.ts';
import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';

import { noJsonParseJsonStringifyBench } from './bench.ts';

describe('no-json-parse-json-stringify visitors', () => {
  itRegistersTypedVisitors(
    noJsonParseJsonStringifyBench.rule,
    noJsonParseJsonStringifyBench.ruleId,
    ['CallExpression'],
  );
});

describe('no-json-parse-json-stringify reports', () => {
  it('reports once per deep-copy idiom on hot-copies', () => {
    const result = replayCreateOnceRule({
      ruleId: noJsonParseJsonStringifyBench.ruleId,
      rule: noJsonParseJsonStringifyBench.rule,
      cases: noJsonParseJsonStringifyBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'noJsonParseJsonStringify')).toBe(true);
  });

  it('reports computed-member JSON["parse"](JSON["stringify"](...))', () => {
    const result = replayCreateOnceRule({
      ruleId: noJsonParseJsonStringifyBench.ruleId,
      rule: noJsonParseJsonStringifyBench.rule,
      cases: [
        {
          name: 'computed',
          filename: '/bench/computed.ts',
          code: 'const copy = JSON["parse"](JSON["stringify"](value));',
        },
        {
          name: 'casted',
          filename: '/bench/casted.ts',
          code: 'const copy = JSON.parse(JSON.stringify(value as object));',
        },
      ],
    });
    expect(result.cases[0]?.reports.length).toBe(1);
    expect(result.cases[1]?.reports.length).toBe(1);
  });

  it('allows lone parse, lone stringify, structuredClone, and split locals', () => {
    const result = replayCreateOnceRule({
      ruleId: noJsonParseJsonStringifyBench.ruleId,
      rule: noJsonParseJsonStringifyBench.rule,
      cases: [
        {
          name: 'lone-parse',
          filename: '/bench/lone-parse.ts',
          code: 'const parsed = JSON.parse(text);',
        },
        {
          name: 'lone-stringify',
          filename: '/bench/lone-stringify.ts',
          code: 'const text = JSON.stringify(value);',
        },
        {
          name: 'clone',
          filename: '/bench/clone.ts',
          code: 'const copy = structuredClone(value);',
        },
        {
          name: 'split-locals',
          filename: '/bench/split.ts',
          code: 'const text = JSON.stringify(value); const copy = JSON.parse(text);',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
    expect(result.cases[1]?.reports).toEqual([]);
    expect(result.cases[2]?.reports).toEqual([]);
    expect(result.cases[3]?.reports).toEqual([]);
  });
});
