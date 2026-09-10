import noEmptyInterfaces from '../../oxlint/rules/no-empty-interfaces.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noEmptyInterfacesBench: BenchCreateOnceRuleInput = {
  name: 'no-empty-interfaces',
  ruleId: 'aqg/no-empty-interfaces',
  rule: noEmptyInterfaces,
  cases: [
    {
      name: 'hot-interfaces',
      filename: '/bench/no-empty-interfaces.types.ts',
      code: repeat((index) => [
        `export interface Base${index} { value: number }`,
        `export interface BareEmpty${index} {}`,
        `export interface Empty${index} extends Base${index} {}`,
        `export interface MultiEmpty${index} extends Base${index}, BareEmpty${index} {}`,
        `export interface Filled${index} extends Base${index} { extra: string }`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noEmptyInterfacesBench);
}
