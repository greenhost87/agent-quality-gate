import { describe, expect, it } from 'bun:test';

import { replayCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';

export function describeRuleBenchReplay(input: BenchCreateOnceRuleInput): void {
  describe(input.name, () => {
    it('replays createOnce bench cases without throwing', () => {
      const result = replayCreateOnceRule({
        ruleId: input.ruleId,
        rule: input.rule,
        cases: input.cases,
      });
      expect(result.cases.length).toBe(input.cases.length);
      for (const benchCase of result.cases) {
        expect(Array.isArray(benchCase.reports)).toBe(true);
      }
    });
  });
}
