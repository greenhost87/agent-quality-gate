export { applyConfiguredRule } from '../system/presets/write-oxlint-config.ts';
export {
  DEFAULT_OXLINT_RULE_PHASE,
  OXLINT_RULE_PHASES,
  OXLINT_RULE_SEVERITIES,
  normalizeOxlintRuleSetting,
  oxlintRulePhaseOf,
} from '../system/presets/write-oxlint-config.ts';
export type {
  OxlintRulePhase,
  OxlintRuleSetting,
  OxlintRuleSeverity,
} from '../system/presets/write-oxlint-config.ts';

export { createOptionsRefCache } from '../system/oxlint/options-ref-cache/options-ref-cache.ts';
export {
  astParentOf,
  childNodes,
  eachParamUnion,
  forEachParamList,
  forEachRuntimeAstNode,
  functionParamVisitors,
  isAstNode,
  nodeParams,
  paramTypeAnnotation,
  paramUnionBeforeVisitors,
  paramUnionType,
  unwrapExpression,
  walkAst,
  walkAstSkippingTypeAndJsxMarkup,
  walkAstSkippingTypeSubtrees,
  walkJsxSurfaceNodes,
} from '../system/oxlint/walk/oxlint-walk.ts';
export type { AstParentOf, WalkAstOptions } from '../system/oxlint/walk/oxlint-walk.ts';
export {
  astIndex,
  astIndexBuildStats,
  clearAstIndex,
  resetAstIndexBuildCount,
} from '../system/oxlint/walk/ast-index.ts';
export type { AstIndex } from '../system/oxlint/walk/ast-index.ts';
