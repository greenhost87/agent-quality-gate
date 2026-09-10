import { expect, it } from 'bun:test';
import type { Options } from '@oxlint/plugins';

import { createBenchRuleContext } from 'agent-quality-gate/oxlint-rule-bench/create-bench-context';
import { requireCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench/require-create-once-rule';

/** Assert O1 visitor keys and that the empty-Program force pattern is gone. */
export function itRegistersTypedVisitors(
  rule: object,
  ruleId: string,
  expectedKeys: readonly string[],
  options: Options = [],
): void {
  it('registers typed visitors without empty Program force', () => {
    const context = createBenchRuleContext(ruleId);
    context.state.options = options;
    const visitors = requireCreateOnceRule(rule)(context);
    for (const key of expectedKeys) {
      expect(typeof Reflect.get(visitors, key)).toBe('function');
    }
    if (!expectedKeys.includes('Program')) {
      expect(visitors.Program).toBeUndefined();
    }
  });
}
