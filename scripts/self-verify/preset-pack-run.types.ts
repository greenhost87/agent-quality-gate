export type RunLocalPresetPackScriptOptions = {
  projectRoot: string;
  scriptName: string;
  step: string;
  okWhat: (presetName: string) => string;
  failureKind: string;
  exclude?: ReadonlySet<string>;
};

export type TestLocalPresetPacksOptions = {
  scriptName?: string;
  failureKind?: string;
  okSuffix?: string;
  exclude?: ReadonlySet<string> | null;
};
