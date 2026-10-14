import type { Diagnostic } from '@oxlint/plugins';
import type { Program } from 'oxc-parser';
import * as v from 'valibot';

import type {
  BenchGetTextArgs,
  BenchRuleContext,
  BenchScope,
  BenchSourceCode,
  BindCaseToContextInput,
  MutableFileState,
} from './bench-create-once-rule.js';

const EMPTY_PROGRAM: Program = {
  type: 'Program',
  body: [],
  sourceType: 'module',
  start: 0,
  end: 0,
  hashbang: null,
};

function emptyState(): MutableFileState {
  return {
    filename: '/bench/fixture.ts',
    cwd: '/bench',
    code: '',
    program: EMPTY_PROGRAM,
    options: [],
    reports: [],
  };
}

function emptyModuleScope(block: Program): BenchScope {
  const scope: BenchScope = {
    type: 'module',
    isStrict: true,
    upper: null,
    childScopes: [],
    get variableScope() {
      return scope;
    },
    block,
    variables: [],
    set: {
      get() {
        return undefined;
      },
    },
    references: [],
    through: [],
    functionExpressionScope: false,
  };
  return scope;
}

function benchSourceText(state: MutableFileState, ...args: BenchGetTextArgs): string {
  const [node, beforeCount, afterCount] = args;
  if (node == null) {
    return state.code;
  }
  const [start, end] = node.range;
  const from = Math.max(0, start - (beforeCount ?? 0));
  const to = Math.min(state.code.length, end + (afterCount ?? 0));
  return state.code.slice(from, to);
}

function createSourceCode(state: MutableFileState): BenchSourceCode {
  return {
    get text() {
      return state.code;
    },
    get hasBOM() {
      return false;
    },
    get ast() {
      return state.program;
    },
    isESTree: true,
    getText: (...args) => benchSourceText(state, ...args),
    getScope() {
      return emptyModuleScope(state.program);
    },
    getAncestors(node) {
      const ancestors: object[] = [];
      let current: unknown = Reflect.get(node, 'parent');
      while (v.is(v.looseObject({}), current)) {
        ancestors.unshift(current);
        current = Reflect.get(current, 'parent');
      }
      return ancestors;
    },
  };
}

export function createBenchRuleContext(ruleId: string): BenchRuleContext {
  const state = emptyState();
  const sourceCode = createSourceCode(state);

  return {
    state,
    get id() {
      return ruleId;
    },
    get options() {
      return state.options;
    },
    get filename() {
      return state.filename;
    },
    getFilename() {
      return state.filename;
    },
    get physicalFilename() {
      return state.filename;
    },
    getPhysicalFilename() {
      return state.filename;
    },
    get cwd() {
      return state.cwd;
    },
    getCwd() {
      return state.cwd;
    },
    get sourceCode() {
      return sourceCode;
    },
    getSourceCode() {
      return sourceCode;
    },
    report(diagnostic: Diagnostic) {
      state.reports.push(diagnostic);
    },
  };
}

export function bindCaseToContext(context: BenchRuleContext, input: BindCaseToContextInput): void {
  context.state.filename = input.filename;
  context.state.cwd = input.cwd;
  context.state.code = input.code;
  context.state.program = input.program;
  context.state.options = input.options;
  context.state.reports = [];
}
