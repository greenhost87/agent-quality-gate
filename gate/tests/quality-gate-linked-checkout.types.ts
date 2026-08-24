export type LinkedCheckoutOptions = {
  mainFixture: 'clean-function' | 'debugger-with-export';
  worktreeFixture: 'clean-function' | 'debugger-with-export';
  layout?: 'nested' | 'external';
  presets?: readonly string[];
};
