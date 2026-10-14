import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import { HOT } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';
import { itRegistersTypedVisitors } from 'agent-quality-gate/internal/presets/baseline/tests/support/expect-typed-visitors.ts';

import { noEmptyInterfacesBench } from './bench.ts';

describe('no-empty-interfaces visitors', () => {
  itRegistersTypedVisitors(noEmptyInterfacesBench.rule, noEmptyInterfacesBench.ruleId, [
    'TSInterfaceDeclaration',
  ]);
});

describe('no-empty-interfaces reports', () => {
  it('reports once per empty interface on hot-interfaces', () => {
    const result = replayCreateOnceRule({
      ruleId: noEmptyInterfacesBench.ruleId,
      rule: noEmptyInterfacesBench.rule,
      cases: noEmptyInterfacesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    // BareEmpty + Empty + MultiEmpty per iteration
    expect(reports.length).toBe(HOT * 3);
    expect(reports.every((report) => report.messageId === 'emptyInterface')).toBe(true);
  });
});
