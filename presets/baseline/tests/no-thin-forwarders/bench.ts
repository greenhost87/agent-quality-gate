import noThinForwarders from '../../oxlint/rules/no-thin-forwarders.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noThinForwardersBench: BenchCreateOnceRuleInput = {
  name: 'no-thin-forwarders',
  ruleId: 'aqg/no-thin-forwarders',
  rule: noThinForwarders,
  cases: [
    {
      name: 'hot-functions',
      filename: '/bench/no-thin-forwarders.ts',
      code: repeat((index) => [
        `function target${index}(value: number): number {`,
        `  return value + ${index};`,
        `}`,
        `function forward${index}(value: number): number {`,
        `  return target${index}(value);`,
        `}`,
        `export function use${index}(value: number): number {`,
        `  return forward${index}(value) + forward${index}(value);`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noThinForwardersBench);
}
