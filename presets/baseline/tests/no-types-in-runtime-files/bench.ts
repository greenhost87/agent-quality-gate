import noTypesInRuntimeFiles from '../../oxlint/rules/no-types-in-runtime-files.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from '../support/hot-code.ts';

export const noTypesInRuntimeFilesBench: BenchCreateOnceRuleInput = {
  name: 'no-types-in-runtime-files',
  ruleId: 'aqg/no-types-in-runtime-files',
  rule: noTypesInRuntimeFiles,
  cases: [
    {
      name: 'hot-runtime-file',
      filename: '/bench/no-types-in-runtime-files.ts',
      code: repeat((index) => [
        `export type Mixed${index} = { id: number };`,
        `export const value${index} = ${index};`,
        `export function run${index}(): number {`,
        `  return value${index};`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noTypesInRuntimeFilesBench);
}
