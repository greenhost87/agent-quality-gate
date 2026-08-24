import type { OxlintRuleSetting } from '../oxlint-config/write-oxlint-config.types.js';
import type { PresetDependencySection } from './preset-dependency-sections.js';

export type PresetProjectDependency = {
  name: string;
  version: string;
  section: PresetDependencySection;
};

export type PresetOxlintOverride = {
  files: string[];
  rules: Record<string, OxlintRuleSetting>;
};

export type PresetManagedFile = {
  destination: string;
  source: string;
  contentHash?: string;
  exampleOnly?: boolean;
};

export type PresetManifest = {
  name: string;
  requires: string[];
  files: PresetManagedFile[];
  dependencies: PresetProjectDependency[];
  ignoreScripts: string[];
  oxlint: {
    nativePlugins: string[];
    plugins: Array<{
      name: string;
      specifier: string;
    }>;
    rules: Record<string, OxlintRuleSetting>;
    overrides: PresetOxlintOverride[];
  };
};

export type ResolvedManagedFile = {
  destination: string;
  absoluteSource: string;
  presetName: string;
  contentHash?: string;
  exampleOnly?: boolean;
};

export type ResolvedOxlintPlugin = {
  name: string;
  absoluteSpecifier: string;
};

export type ActivatedPreset = {
  name: string;
  root: string;
};

export type ResolvedPresetContract = {
  names: string[];
  activated: ActivatedPreset[];
  files: ResolvedManagedFile[];
  dependencies: PresetProjectDependency[];
  ignoreScripts: string[];
  nativePlugins: string[];
  plugins: ResolvedOxlintPlugin[];
  rules: Record<string, OxlintRuleSetting>;
  overrides: PresetOxlintOverride[];
};

export type PresetDependencyViolation = {
  name: string;
  section: PresetDependencySection;
  requiredVersion: string;
  actualRange: string | undefined;
  reason: 'missing-section' | 'missing-dependency' | 'incompatible-range' | 'leaked-section';
};

export type PresetIgnoreScriptsViolation = {
  required: string[];
  actual: string[] | undefined;
  reason: 'missing-field' | 'invalid-field' | 'missing-entries';
};

export type PresetDependencyResult = {
  ok: boolean;
  violations: PresetDependencyViolation[];
  ignoreScriptsViolations: PresetIgnoreScriptsViolation[];
};

export type ManagedFileMismatch = {
  destination: string;
  presetName: string;
  reason: 'missing' | 'modified';
  examplePath: string;
};

export type PresetManagedFilesResult =
  | {
      ok: true;
      mismatches: ManagedFileMismatch[];
    }
  | {
      ok: false;
      error: string;
    };
