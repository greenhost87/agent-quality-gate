import { bench, run } from 'mitata';
import type { Options } from '@oxlint/plugins';

import { bindCaseToContext, createBenchRuleContext } from './create-bench-context.js';
import { parseFixture, walkProgram } from './parse-and-walk.js';
import { requireCreateOnceRule } from './require-create-once-rule.js';
import type {
  BenchCaseInput,
  BenchCreateOnceRuleInput,
  PreparedReplay,
  ReplayCaseResult,
  ReplayCreateOnceRuleInput,
  ReplayCreateOnceRuleResult,
} from './bench-create-once-rule.types.js';

function preparedFilename(input: BenchCaseInput, index: number): string {
  return input.filename ?? `/bench/case-${index}.ts`;
}

function preparedCwd(input: BenchCaseInput): string {
  return input.cwd ?? '/bench';
}

function prepareReplay(input: ReplayCreateOnceRuleInput): PreparedReplay {
  const createOnce = requireCreateOnceRule(input.rule);
  const context = createBenchRuleContext(input.ruleId);
  const visitors = createOnce(context);
  const cases = input.cases.map((benchCase, index) => {
    const filename = preparedFilename(benchCase, index);
    const parsed = parseFixture(filename, benchCase.code);
    const options: Options = benchCase.options ?? [];
    return {
      name: benchCase.name,
      filename,
      cwd: preparedCwd(benchCase),
      code: parsed.code,
      program: parsed.program,
      options,
    };
  });
  return { visitors, context, cases };
}

export function replayPreparedCase(prepared: PreparedReplay, caseIndex: number): ReplayCaseResult {
  const benchCase = prepared.cases[caseIndex];
  if (benchCase == null) {
    throw new Error(`missing prepared case at index ${caseIndex}`);
  }

  bindCaseToContext(prepared.context, benchCase);
  if (prepared.visitors.before?.() === false) {
    return {
      name: benchCase.name,
      reports: [...prepared.context.state.reports],
    };
  }

  walkProgram(benchCase.program, prepared.visitors);
  prepared.visitors.after?.();

  return {
    name: benchCase.name,
    reports: [...prepared.context.state.reports],
  };
}

export function replayCreateOnceRule(input: ReplayCreateOnceRuleInput): ReplayCreateOnceRuleResult {
  const prepared = prepareReplay(input);
  return {
    cases: prepared.cases.map((_, index) => replayPreparedCase(prepared, index)),
  };
}

export async function benchCreateOnceRule(input: BenchCreateOnceRuleInput): Promise<void> {
  await benchCreateOnceRules([input]);
}

export async function benchCreateOnceRules(inputs: BenchCreateOnceRuleInput[]): Promise<void> {
  for (const input of inputs) {
    const prepared = prepareReplay(input);
    for (const [index, benchCase] of prepared.cases.entries()) {
      bench(`${input.name}/${benchCase.name}`, () => {
        replayPreparedCase(prepared, index);
      });
    }
  }

  await run();
}
