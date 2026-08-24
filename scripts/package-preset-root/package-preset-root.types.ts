export type PackagePresetRootOptions = {
  sourceRoot: string;
  destinationRoot: string;
  /** Working directory for bundling `check.ts` (module resolution). Defaults to `sourceRoot`. */
  bundleCwd?: string;
};
