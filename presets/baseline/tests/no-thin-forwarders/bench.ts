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
    {
      name: 'hot-object-properties',
      filename: '/bench/no-thin-forwarders-object.ts',
      code: repeat((index) => [
        `declare const target${index}: { call: (value: number) => number };`,
        `export const bag${index} = {`,
        `  call: (value: number) => target${index}.call(value),`,
        `};`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noThinForwardersBench);
}
