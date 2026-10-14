import type { OxlintRuleSetting } from './write-oxlint-config.js';
import type { CheckResult } from '../gate/run/check-result.js';
import type { CombinedUiSection, DeadCodeIssueArrays } from '../gate/run/fallow/json-schemas.js';

export const PRESET_DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies'] as const;
export type PresetDependencySection = (typeof PRESET_DEPENDENCY_SECTIONS)[number];

export type PresetProjectDependency = {
  name: string;
  version: string;
  compatibleVersions?: string[];
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
  fallow?: {
    rules: Record<string, string>;
    checkKeys: string[];
  };
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
  fallowRules: Record<string, string>;
  fallowCheckKeys: string[];
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

export type PresetVerifyContext = {
  projectRoot: string;
  entries: readonly string[];
  ignorePatterns: readonly string[];
  fallowConfigPath: string;
  managedFilePaths: ReadonlySet<string>;
  fallowUiCoverage: CombinedUiSection | undefined;
  fallowUiAudit?: {
    findings: readonly { rule: string; path: string; line: number; message: string }[];
  };
  fallowCheckSection: DeadCodeIssueArrays | undefined;
};

export type PresetCheckModule = {
  preflight?: (
    projectRoot: string,
    presetConfig?: object,
  ) => CheckResult | undefined | Promise<CheckResult | undefined>;
  runToolChecks?: (context: PresetVerifyContext, presetConfig?: object) => Promise<CheckResult[]>;
};

export const PRESET_CHECK_MODULE_BASENAMES = ['check.js', 'check.ts'] as const;
