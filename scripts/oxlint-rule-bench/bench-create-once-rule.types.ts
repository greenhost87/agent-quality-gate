import type { Diagnostic, Options, VisitorWithHooks } from '@oxlint/plugins';
import type { Program } from 'oxc-parser';

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

export type AstChildValue = AstNode | AstNode[] | string | number | boolean | null;

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
