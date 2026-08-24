import maxInlineParameterObjectMembers from '../../oxlint/rules/max-inline-parameter-object-members.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const maxInlineParameterObjectMembersBench: BenchCreateOnceRuleInput = {
  name: 'max-inline-parameter-object-members',
  ruleId: 'aqg/max-inline-parameter-object-members',
  rule: maxInlineParameterObjectMembers,
  cases: [
    {
      name: 'hot-wide',
      filename: '/bench/max-inline-parameter-object-members.ts',
      options: [{ max: 3 }],
      code: repeat((index) => [
        `export function wide${index}(options: { a: string; b: string; c: string; d: string }): void {`,
        `  void options;`,
        `}`,
        `export function allowed${index}(options: { a: string; b: string; c: string }): void {`,
        `  void options;`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(maxInlineParameterObjectMembersBench);
}
