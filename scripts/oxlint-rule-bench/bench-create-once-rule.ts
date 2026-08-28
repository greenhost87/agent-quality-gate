import { bench, run } from 'mitata';
import type { Diagnostic, Options, VisitorWithHooks } from '@oxlint/plugins';

import { bindCaseToContext, createBenchRuleContext } from './create-bench-context.js';
import { parseFixture, walkProgram } from './parse-and-walk.js';
import { requireCreateOnceRule } from './require-create-once-rule.js';
import type { Program } from 'oxc-parser';

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

export type BenchCaseInput = {
  name: string;
  code: string;
  filename?: string;
  cwd?: string;
  options?: Options;
};

export type ReplayCreateOnceRuleInput = {
  ruleId: string;
  rule: object;
  cases: BenchCaseInput[];
};

export type ReplayCaseResult = {
  name: string;
  reports: Diagnostic[];
};

export type ReplayCreateOnceRuleResult = {
  cases: ReplayCaseResult[];
};

export type BenchCreateOnceRuleInput = {
  name: string;
  ruleId: string;
  rule: object;
  cases: BenchCaseInput[];
};

export type MutableFileState = {
  filename: string;
  cwd: string;
  code: string;
  program: Program;
  options: Options;
  reports: Diagnostic[];
};

export type BenchScope = {
  type: 'module';
  isStrict: boolean;
  upper: null;
  childScopes: BenchScope[];
  variableScope: BenchScope;
  block: Program;
  variables: never[];
  set: { get(name: string): undefined };
  references: never[];
  through: never[];
  functionExpressionScope: boolean;
};

export type BenchSourceCode = {
  readonly text: string;
  readonly hasBOM: boolean;
  readonly ast: Program;
  readonly isESTree: true;
  getText(
    node?: { range?: [number, number]; start?: number; end?: number } | null,
    beforeCount?: number | null,
    afterCount?: number | null,
  ): string;
  getScope(node: object): BenchScope;
};

export type BenchRuleContext = {
  readonly state: MutableFileState;
  readonly id: string;
  readonly options: Options;
  readonly filename: string;
  getFilename(): string;
  readonly physicalFilename: string;
  getPhysicalFilename(): string;
  readonly cwd: string;
  getCwd(): string;
  readonly sourceCode: BenchSourceCode;
  getSourceCode(): BenchSourceCode;
  report(diagnostic: Diagnostic): void;
};

export type BenchCreateOnce = (context: BenchRuleContext) => VisitorWithHooks;

export type BenchableCreateOnceRule = {
  createOnce: BenchCreateOnce;
  create?: (context: BenchRuleContext) => object;
};

export type ParsedProgram = {
  filename: string;
  code: string;
  program: Program;
};

export type AstNode = {
  type: string;
  parent?: AstNode | null;
  [key: string]: AstNode | AstNode[] | string | number | boolean | null | undefined;
};

export type AstChildValue = AstNode | readonly unknown[] | string | number | boolean | null;

export type PreparedCase = {
  name: string;
  filename: string;
  cwd: string;
  code: string;
  program: Program;
  options: Options;
};

export type BindCaseToContextInput = {
  filename: string;
  cwd: string;
  code: string;
  program: Program;
  options: Options;
};

export type PreparedReplay = {
  visitors: VisitorWithHooks;
  context: BenchRuleContext;
  cases: PreparedCase[];
};
