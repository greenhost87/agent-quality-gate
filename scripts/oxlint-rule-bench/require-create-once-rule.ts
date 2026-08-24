import type { BenchableCreateOnceRule, BenchCreateOnce } from './bench-create-once-rule.types.js';

function hasFunctionProperty(rule: object, name: 'createOnce' | 'create'): boolean {
  return typeof Reflect.get(rule, name) === 'function';
}

export function isBenchableCreateOnceRule(rule: object): rule is BenchableCreateOnceRule {
  return hasFunctionProperty(rule, 'createOnce');
}

export function requireCreateOnceRule(rule: object): BenchCreateOnce {
  if (isBenchableCreateOnceRule(rule)) {
    return rule.createOnce;
  }
  if (hasFunctionProperty(rule, 'create')) {
    throw new Error(
      'oxlint rule bench requires createOnce; migrate this rule off create before benchmarking',
    );
  }
  throw new Error('oxlint rule bench requires a createOnce method on the rule');
}
