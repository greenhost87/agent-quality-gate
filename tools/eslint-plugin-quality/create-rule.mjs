export function createRule(rule) {
  return {
    ...rule,
    create(context) {
      return rule.create(context, context.options.length > 0 ? context.options : (rule.defaultOptions ?? []));
    },
  };
}
