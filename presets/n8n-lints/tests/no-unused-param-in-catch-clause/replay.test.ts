import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { HOT } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

import { itRegistersTypedVisitors } from '../support/expect-typed-visitors.ts';
import { noUnusedParamInCatchClauseBench } from './bench.ts';

describe('no-unused-param-in-catch-clause visitors', () => {
  itRegistersTypedVisitors(
    noUnusedParamInCatchClauseBench.rule,
    noUnusedParamInCatchClauseBench.ruleId,
    ['CatchClause'],
  );
});

describe('no-unused-param-in-catch-clause reports', () => {
  it('reports once per unused param on hot-unused', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnusedParamInCatchClauseBench.ruleId,
      rule: noUnusedParamInCatchClauseBench.rule,
      cases: noUnusedParamInCatchClauseBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'unusedParam')).toBe(true);
  });

  it('reports underscore params even when referenced', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnusedParamInCatchClauseBench.ruleId,
      rule: noUnusedParamInCatchClauseBench.rule,
      cases: [
        {
          name: 'underscore',
          filename: '/bench/underscore.ts',
          code: 'try { run(); } catch (_error) { console.error(_error); }',
        },
      ],
    });
    expect(result.cases[0]?.reports.map((report) => report.messageId)).toEqual([
      'omitUnderscoreParam',
    ]);
  });

  it('allows used params, bare catch, and rethrow use', () => {
    const result = replayCreateOnceRule({
      ruleId: noUnusedParamInCatchClauseBench.ruleId,
      rule: noUnusedParamInCatchClauseBench.rule,
      cases: [
        {
          name: 'used',
          filename: '/bench/used.ts',
          code: 'try { run(); } catch (error) { console.error(error); }',
        },
        {
          name: 'bare',
          filename: '/bench/bare.ts',
          code: 'try { run(); } catch { report("failed"); }',
        },
        {
          name: 'rethrow',
          filename: '/bench/rethrow.ts',
          code: 'try { run(); } catch (error) { throw error; }',
        },
      ],
    });
    expect(result.cases[0]?.reports).toEqual([]);
    expect(result.cases[1]?.reports).toEqual([]);
    expect(result.cases[2]?.reports).toEqual([]);
  });
});
