export {
  benchCreateOnceRule,
  benchSharedAstCreateOnceRules,
  formatAggregateSameAstResult,
  measureAggregateSameAst,
  measureAggregateSameAstFixture,
  registerAggregateSameAstFixtureBenches,
  registerCreateOnceRules,
  registerSharedAstCreateOnceRules,
  replayCreateOnceRule,
  replaySharedAstPrepared,
} from '#system/oxlint/rule-bench/bench-create-once-rule.js';
export type { BenchCreateOnceRuleInput } from '#system/oxlint/rule-bench/bench-create-once-rule.js';
export { createBenchRuleContext } from '#system/oxlint/rule-bench/create-bench-context.js';
export { requireCreateOnceRule } from '#system/oxlint/rule-bench/require-create-once-rule.js';
export { HOT, repeat } from '#system/oxlint/rule-bench/hot-code.js';
export { runRegisteredBenches } from '#system/oxlint/rule-bench/bench-create-once-rule.js';
