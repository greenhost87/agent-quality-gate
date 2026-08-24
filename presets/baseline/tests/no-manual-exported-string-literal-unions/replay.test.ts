import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { HOT } from '../support/hot-code.ts';

import { noManualExportedStringLiteralUnionsBench } from './bench.ts';

describeRuleBenchReplay(noManualExportedStringLiteralUnionsBench);

describe('no-manual-exported-string-literal-unions before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noManualExportedStringLiteralUnionsBench.rule);
    const context = createBenchRuleContext(noManualExportedStringLiteralUnionsBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-manual-exported-string-literal-unions reports', () => {
  it('reports once per manual string literal union on hot-unions', () => {
    const result = replayCreateOnceRule({
      ruleId: noManualExportedStringLiteralUnionsBench.ruleId,
      rule: noManualExportedStringLiteralUnionsBench.rule,
      cases: noManualExportedStringLiteralUnionsBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'manual')).toBe(true);
  });
});
