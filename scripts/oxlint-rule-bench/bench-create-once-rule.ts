import { bench, run } from 'mitata';
import type { Diagnostic, ESTree, Options, Ranged, VisitorWithHooks } from '@oxlint/plugins';
import type { Program } from 'oxc-parser';

import { astIndex, astIndexBuildStats, resetAstIndexBuildCount } from '../oxlint-walk/ast-index.ts';
import { isAstNode, walkAst } from '../oxlint-walk/oxlint-walk.ts';
import { bindCaseToContext, createBenchRuleContext } from './create-bench-context.js';
import { parseFixture, walkProgram } from './parse-and-walk.js';
import { requireCreateOnceRule } from './require-create-once-rule.js';

function walkProgramRoot(program: Program) {
  if (!isAstNode(program)) {
    throw new Error('expected AST node');
  }
  return program;
}

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

export function registerCreateOnceRules(inputs: BenchCreateOnceRuleInput[]): void {
  for (const input of inputs) {
    const prepared = prepareReplay(input);
    for (const [index, benchCase] of prepared.cases.entries()) {
      bench(`${input.name}/${benchCase.name}`, () => {
        replayPreparedCase(prepared, index);
      });
    }
  }
}

export async function benchCreateOnceRules(inputs: BenchCreateOnceRuleInput[]): Promise<void> {
  registerCreateOnceRules(inputs);
  await run();
}

function prepareSharedAstReplay(input: BenchSharedAstInput): PreparedSharedAstReplay {
  const parsed = parseFixture(input.filename, input.code);
  const cwd = input.cwd ?? '/bench';
  return {
    name: input.name,
    filename: input.filename,
    cwd,
    code: parsed.code,
    program: parsed.program,
    rules: input.rules.map((ruleInput) => {
      const context = createBenchRuleContext(ruleInput.ruleId);
      const visitors = requireCreateOnceRule(ruleInput.rule)(context);
      return {
        name: ruleInput.name,
        context,
        visitors,
        options: ruleInput.options ?? [],
      };
    }),
  };
}

export function replaySharedAstPrepared(prepared: PreparedSharedAstReplay): void {
  for (const rule of prepared.rules) {
    bindCaseToContext(rule.context, {
      filename: prepared.filename,
      cwd: prepared.cwd,
      code: prepared.code,
      program: prepared.program,
      options: rule.options,
    });
    if (rule.visitors.before?.() === false) {
      continue;
    }
    walkProgram(prepared.program, rule.visitors);
    rule.visitors.after?.();
  }
}

/** Register a bench that runs multiple createOnce rules against one freshly parsed AST. */
export function registerSharedAstCreateOnceRules(
  input: BenchSharedAstInput,
): PreparedSharedAstReplay {
  const prepared = prepareSharedAstReplay(input);
  bench(`${input.name}/shared-ast-all-rules`, () => {
    replaySharedAstPrepared(prepared);
  });
  return prepared;
}

export async function benchSharedAstCreateOnceRules(input: BenchSharedAstInput): Promise<void> {
  registerSharedAstCreateOnceRules(input);
  await run();
}

export function registerAggregateSameAstBenches(
  program: Program,
  label = 'aggregate-same-ast',
): void {
  const candidateTypes = [
    'CallExpression',
    'ClassDeclaration',
    'ClassExpression',
    'ImportExpression',
    'TSInterfaceDeclaration',
    'VariableDeclarator',
    'TSIndexedAccessType',
    'ObjectExpression',
    'BinaryExpression',
    'Literal',
    'TemplateLiteral',
  ] as const;
  const root = walkProgramRoot(program);

  bench(`${label}/repeated-whole-program-walks`, () => {
    for (const type of candidateTypes) {
      walkAst(root, (node) => {
        void (node.type === type);
      });
    }
  });

  bench(`${label}/shared-indexed-dispatch`, () => {
    const index = astIndex(program);
    for (const type of candidateTypes) {
      void index.nodesOfType(type).length;
    }
  });
}

export function measureAggregateSameAst(program: Program): AggregateSameAstResult {
  const candidateTypes = [
    'CallExpression',
    'ClassDeclaration',
    'ClassExpression',
    'ImportExpression',
    'TSInterfaceDeclaration',
    'VariableDeclarator',
    'TSIndexedAccessType',
    'ObjectExpression',
    'BinaryExpression',
    'Literal',
    'TemplateLiteral',
  ] as const;
  const root = walkProgramRoot(program);

  const walkStarted = performance.now();
  let walkHits = 0;
  for (const type of candidateTypes) {
    walkAst(root, (node) => {
      if (node.type === type) {
        walkHits += 1;
      }
    });
  }
  const repeatedWalkMs = performance.now() - walkStarted;

  resetAstIndexBuildCount();
  const indexStarted = performance.now();
  const index = astIndex(program);
  let indexedHits = 0;
  for (const type of candidateTypes) {
    indexedHits += index.nodesOfType(type).length;
  }
  const sharedIndexMs = performance.now() - indexStarted;

  return {
    candidatePasses: candidateTypes.length,
    repeatedWalkMs,
    sharedIndexMs,
    walkHits,
    indexedHits,
    indexBuilds: astIndexBuildStats().builds,
  };
}

export function measureAggregateSameAstFixture(
  filename: string,
  code: string,
): AggregateSameAstResult {
  return measureAggregateSameAst(parseFixture(filename, code).program);
}

export function registerAggregateSameAstFixtureBenches(
  filename: string,
  code: string,
  label = 'aggregate-same-ast',
): void {
  registerAggregateSameAstBenches(parseFixture(filename, code).program, label);
}

export function formatAggregateSameAstResult(result: AggregateSameAstResult): string {
  return [
    'aggregate-same-ast',
    `candidatePasses=${result.candidatePasses}`,
    `indexBuilds=${result.indexBuilds}`,
    `walkHits=${result.walkHits}`,
    `indexedHits=${result.indexedHits}`,
    `repeatedWalkMs=${result.repeatedWalkMs.toFixed(3)}`,
    `sharedIndexMs=${result.sharedIndexMs.toFixed(3)}`,
  ].join(' ');
}

export async function runRegisteredBenches(): Promise<void> {
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

export type BenchGetTextArgs =
  | []
  | [node: Ranged | null]
  | [node: Ranged | null, beforeCount: number | null]
  | [node: Ranged | null, beforeCount: number | null, afterCount: number | null];

export type BenchSourceCode = {
  readonly text: string;
  readonly hasBOM: boolean;
  readonly ast: Program;
  readonly isESTree: true;
  getText: (...args: BenchGetTextArgs) => string;
  getScope(node: object): BenchScope;
  getAncestors(node: ESTree.Node): object[];
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

export type SharedAstRuleInput = {
  name: string;
  ruleId: string;
  rule: object;
  options?: Options;
};

export type BenchSharedAstInput = {
  name: string;
  filename: string;
  code: string;
  cwd?: string;
  rules: SharedAstRuleInput[];
};

export type PreparedSharedAstRule = {
  name: string;
  context: BenchRuleContext;
  visitors: VisitorWithHooks;
  options: Options;
};

export type PreparedSharedAstReplay = {
  name: string;
  filename: string;
  cwd: string;
  code: string;
  program: Program;
  rules: PreparedSharedAstRule[];
};

export type AggregateSameAstResult = {
  candidatePasses: number;
  repeatedWalkMs: number;
  sharedIndexMs: number;
  walkHits: number;
  indexedHits: number;
  indexBuilds: number;
};
