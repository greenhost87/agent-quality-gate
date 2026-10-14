import noRuntimeInTypesFiles from 'agent-quality-gate/internal/presets/baseline/oxlint/rules/no-runtime-in-types-files.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/testing/oxlint';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/testing/oxlint';
import { repeat } from 'agent-quality-gate/internal/presets/baseline/tests/support/hot-code.ts';

export const noRuntimeInTypesFilesBench: BenchCreateOnceRuleInput = {
  name: 'no-runtime-in-types-files',
  ruleId: 'aqg/no-runtime-in-types-files',
  rule: noRuntimeInTypesFiles,
  cases: [
    {
      name: 'hot-types-file',
      filename: '/bench/no-runtime-in-types-files.types.ts',
      code: repeat((index) => [
        `export type Value${index} = string;`,
        `export const leaked${index} = ${index};`,
        `export function bad${index}(): void {}`,
        `export interface Ok${index} { id: number }`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noRuntimeInTypesFilesBench);
}
