import { noRawJsonParse } from '../../oxlint/no-raw-json-parse.ts';

import { benchCreateOnceRule } from 'agent-quality-gate/oxlint-rule-bench';
import type { BenchCreateOnceRuleInput } from 'agent-quality-gate/oxlint-rule-bench/types';
import { repeat } from 'agent-quality-gate/oxlint-rule-bench/hot-code';

export const noRawJsonParseBench: BenchCreateOnceRuleInput = {
  name: 'no-raw-json-parse',
  ruleId: 'bun-parse/no-raw-json-parse',
  rule: noRawJsonParse,
  cases: [
    {
      name: 'hot-json-parse',
      filename: '/bench/utils.ts',
      cwd: '/bench',
      code: repeat((index) => [
        `export function read${index}(text: string): unknown {`,
        `  return JSON.parse(text);`,
        `}`,
      ]),
    },
    {
      name: 'hot-validated-bun-json',
      filename: '/bench/system/config/load.ts',
      cwd: '/bench',
      code: repeat((index) => [
        `import * as v from 'valibot';`,
        `const Schema${index} = v.object({ name: v.string() });`,
        `export async function load${index}(path: string) {`,
        `  const f = Bun.file(path);`,
        `  const raw: unknown = await f.json();`,
        `  return v.parse(Schema${index}, raw);`,
        `}`,
      ]),
    },
    {
      name: 'hot-bare-parse-json-text',
      filename: '/bench/http/parse-json.ts',
      cwd: '/bench',
      code: repeat((index) => [
        `import * as v from 'valibot';`,
        `export function parse${index}(text: string): unknown {`,
        `  return v.parse(v.pipe(v.string(), v.parseJson()), text);`,
        `}`,
      ]),
    },
  ],
};

if (import.meta.main) {
  await benchCreateOnceRule(noRawJsonParseBench);
}
