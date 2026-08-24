export type CreateProjectOptions = {
  fixtureCase?: 'clean-config-source' | 'debugger-with-export' | 'export-value' | 'env-token';
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  ignoreScripts?: readonly string[];
  scripts?: Record<string, string>;
  install?: boolean;
};
