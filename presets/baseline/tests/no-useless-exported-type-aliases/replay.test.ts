import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { HOT } from '../support/hot-code.ts';

import { noUselessExportedTypeAliasesBench } from './bench.ts';

describeRuleBenchReplay(noUselessExportedTypeAliasesBench);

describe('no-useless-exported-type-aliases before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noUselessExportedTypeAliasesBench.rule);
    const context = createBenchRuleContext(noUselessExportedTypeAliasesBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-useless-exported-type-aliases reports', () => {
  it('reports once per useless exported alias on hot-aliases', () => {
    const result = replayCreateOnceRule({
      ruleId: noUselessExportedTypeAliasesBench.ruleId,
      rule: noUselessExportedTypeAliasesBench.rule,
      cases: noUselessExportedTypeAliasesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'uselessAlias')).toBe(true);
  });
});
