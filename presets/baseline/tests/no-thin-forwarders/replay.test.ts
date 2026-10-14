import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';
import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/baseline/tests/support/expect-typed-visitors.ts';

import { noThinForwardersBench } from './bench.ts';
describe('no-thin-forwarders visitors', () => {
  itRegistersTypedVisitors(noThinForwardersBench.rule, noThinForwardersBench.ruleId, [
    'Program',
    'ObjectExpression',
  ]);
});

describe('no-thin-forwarders reports', () => {
  it('reports once per thin forwarder on hot-functions', () => {
    const result = replayCreateOnceRule({
      ruleId: noThinForwardersBench.ruleId,
      rule: noThinForwardersBench.rule,
      cases: noThinForwardersBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'thinForwarder')).toBe(true);
  });

  it('reports once per thin forwarder on hot-object-properties', () => {
    const result = replayCreateOnceRule({
      ruleId: noThinForwardersBench.ruleId,
      rule: noThinForwardersBench.rule,
      cases: noThinForwardersBench.cases,
    });
    const reports = result.cases[1]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'thinForwarder')).toBe(true);
  });
});
