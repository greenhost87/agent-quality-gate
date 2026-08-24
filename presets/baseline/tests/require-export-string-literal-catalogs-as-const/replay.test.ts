import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { HOT } from '../support/hot-code.ts';

import { requireExportStringLiteralCatalogsAsConstBench } from './bench.ts';

describeRuleBenchReplay(requireExportStringLiteralCatalogsAsConstBench);

describe('require-export-string-literal-catalogs-as-const before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(requireExportStringLiteralCatalogsAsConstBench.rule);
    const context = createBenchRuleContext(requireExportStringLiteralCatalogsAsConstBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('require-export-string-literal-catalogs-as-const reports', () => {
  it('reports once per non-const catalog on hot-catalogs', () => {
    const result = replayCreateOnceRule({
      ruleId: requireExportStringLiteralCatalogsAsConstBench.ruleId,
      rule: requireExportStringLiteralCatalogsAsConstBench.rule,
      cases: requireExportStringLiteralCatalogsAsConstBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'invalid')).toBe(true);
  });
});
