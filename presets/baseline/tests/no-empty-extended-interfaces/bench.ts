import noEmptyExtendedInterfaces from '../../oxlint/rules/no-empty-extended-interfaces.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noEmptyExtendedInterfacesBench: BenchCreateOnceRuleInput = {
  name: 'no-empty-extended-interfaces',
  ruleId: 'aqg/no-empty-extended-interfaces',
  rule: noEmptyExtendedInterfaces,
  cases: [
    {
      name: 'hot-interfaces',
      filename: '/bench/no-empty-extended-interfaces.types.ts',
      code: repeat((index) => [
        `export interface Base${index} { value: number }`,
        `export interface Empty${index} extends Base${index} {}`,
        `export interface Filled${index} extends Base${index} { extra: string }`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noEmptyExtendedInterfacesBench);
}
