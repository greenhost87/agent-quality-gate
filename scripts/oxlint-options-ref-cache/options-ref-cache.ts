/**
 * Cache parsed rule options for the lifetime of a createOnce closure.
 *
 * Oxlint reuses the same `context.options` object identity for all files that
 * share one rule-config / override bucket (verified by O8 A2d probe). When the
 * reference changes, options must be re-parsed. Do not key on filename or AST.
 */
export function createOptionsRefCache<Options, Parsed>(
  parse: (options: Options) => Parsed,
): {
  get: (options: Options) => Parsed;
  parseCount: () => number;
  resetParseCount: () => void;
} {
  let cachedRef: Options | undefined;
  let cachedValue: Parsed | undefined;
  let parses = 0;

  return {
    get(options: Options): Parsed {
      if (cachedRef !== options || cachedValue === undefined) {
        cachedRef = options;
        cachedValue = parse(options);
        parses += 1;
      }
      return cachedValue;
    },
    parseCount() {
      return parses;
    },
    resetParseCount() {
      parses = 0;
    },
  };
}
