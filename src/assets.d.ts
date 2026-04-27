declare module '*.cjs' {
  const content: string;
  export default content;
}

declare module '*.mjs' {
  const content: string;
  export default content;
}

declare module '*.yml' {
  const content: string;
  export default content;
}

declare module '*/dependency-cruiser/src/analyze/index.mjs' {
  export default function analyze(modules: object[], options: object, targets: string[]): object;
}

declare module '*/dependency-cruiser/src/extract/index.mjs' {
  export default function extract(
    targets: string[],
    cruiseOptions: object,
    resolveOptions: object,
    transpileOptions: object
  ): object[];
}

declare module '*/dependency-cruiser/src/main/options/normalize.mjs' {
  export function normalizeCruiseOptions(options: object, targets?: string[]): {
    exclude: { path?: string | RegExp };
  };
}

declare module '*/dependency-cruiser/src/main/rule-set/normalize.mjs' {
  export default function normalizeRuleSet(ruleSet: object): object;
}

declare module '*/dependency-cruiser/src/report/error.mjs' {
  export default function errorReporter(result: object, options: object): {
    exitCode: number;
    output: string;
  };
}

declare module '../../node_modules/dependency-cruiser/src/analyze/index.mjs' {
  export { default } from '*/dependency-cruiser/src/analyze/index.mjs';
}

declare module '../../node_modules/dependency-cruiser/src/extract/index.mjs' {
  export { default } from '*/dependency-cruiser/src/extract/index.mjs';
}

declare module '../../node_modules/dependency-cruiser/src/main/options/normalize.mjs' {
  export { normalizeCruiseOptions } from '*/dependency-cruiser/src/main/options/normalize.mjs';
}

declare module '../../node_modules/dependency-cruiser/src/main/rule-set/normalize.mjs' {
  export { default } from '*/dependency-cruiser/src/main/rule-set/normalize.mjs';
}

declare module '../../node_modules/dependency-cruiser/src/report/error.mjs' {
  export { default } from '*/dependency-cruiser/src/report/error.mjs';
}
