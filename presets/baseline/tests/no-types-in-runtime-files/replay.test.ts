import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';
import { describeRuleBenchReplay } from '../support/describe-rule-bench-replay.ts';
import { HOT } from '../support/hot-code.ts';
import { readRuleFixture } from '../support/read-rule-fixture.ts';

import noTypesInRuntimeFiles from '../../oxlint/rules/no-types-in-runtime-files.ts';
import { noTypesInRuntimeFilesBench } from './bench.ts';

const RULE_ID = 'aqg/no-types-in-runtime-files';

describeRuleBenchReplay(noTypesInRuntimeFilesBench);

describe('no-types-in-runtime-files before skip', () => {
  it('runs the scan in before and skips the visitor walk', () => {
    const createOnce = requireCreateOnceRule(noTypesInRuntimeFilesBench.rule);
    const context = createBenchRuleContext(noTypesInRuntimeFilesBench.ruleId);
    const visitors = createOnce(context);
    expect(visitors.before?.()).toBe(false);
  });
});

describe('no-types-in-runtime-files reports', () => {
  it('reports once per Mixed type on hot-runtime-file', () => {
    const result = replayCreateOnceRule({
      ruleId: noTypesInRuntimeFilesBench.ruleId,
      rule: noTypesInRuntimeFilesBench.rule,
      cases: noTypesInRuntimeFilesBench.cases,
    });
    const reports = result.cases[0]?.reports ?? [];
    expect(reports.length).toBe(HOT);
    expect(reports.every((report) => report.messageId === 'mixed')).toBe(true);
  });

  it('allows InferOutput and InferInput companions for local schemas', () => {
    const result = replayCreateOnceRule({
      ruleId: RULE_ID,
      rule: noTypesInRuntimeFiles,
      cases: [
        {
          name: 'infer-companions',
          filename: '/bench/schema-runtime.ts',
          code: readRuleFixture(import.meta.dir, 'infer-companions.txt'),
        },
      ],
    });
    expect(result.cases[0]?.reports ?? []).toEqual([]);
  });

  it('still reports unrelated mixed types and Infer* of foreign schemas', () => {
    const result = replayCreateOnceRule({
      ruleId: RULE_ID,
      rule: noTypesInRuntimeFiles,
      cases: [
        {
          name: 'non-companions',
          filename: '/bench/mixed-runtime.ts',
          code: readRuleFixture(import.meta.dir, 'non-companions.txt'),
        },
      ],
    });
    const messageIds = (result.cases[0]?.reports ?? []).map((report) => report.messageId);
    expect(messageIds).toEqual(['mixed', 'mixed', 'mixed']);
  });
});
