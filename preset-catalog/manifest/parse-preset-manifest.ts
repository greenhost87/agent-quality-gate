import { file } from 'bun';
import * as v from 'valibot';

import { OXLINT_RULE_SEVERITIES } from '../oxlint-config/oxlint-rule-setting.js';
import type { OxlintRuleSetting } from '../oxlint-config/write-oxlint-config.types.js';
import type { PresetManifest } from '../contract/preset-contract.types.js';
import { PRESET_DEPENDENCY_SECTIONS } from '../contract/preset-dependency-sections.js';

const NonEmptyString = v.pipe(v.string(), v.minLength(1));

const Sha256HexSchema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u));

const ManagedFileSchema = v.object({
  destination: NonEmptyString,
  source: NonEmptyString,
  contentHash: v.optional(Sha256HexSchema),
  exampleOnly: v.optional(v.boolean()),
});

const DependencySchema = v.object({
  name: NonEmptyString,
  version: NonEmptyString,
  section: v.picklist(PRESET_DEPENDENCY_SECTIONS),
});

const OxlintPluginSchema = v.object({
  name: NonEmptyString,
  specifier: NonEmptyString,
});

const RuleSeveritySchema = v.picklist(OXLINT_RULE_SEVERITIES);

const RuleSettingSchema: v.GenericSchema<OxlintRuleSetting> = v.union([
  RuleSeveritySchema,
  v.tuple([RuleSeveritySchema, v.looseObject({})]),
]);

const OverrideSchema = v.object({
  files: v.pipe(v.array(NonEmptyString), v.minLength(1)),
  rules: v.record(v.string(), RuleSettingSchema),
});

const OxlintSchema = v.object({
  nativePlugins: v.optional(v.array(NonEmptyString), []),
  plugins: v.array(OxlintPluginSchema),
  rules: v.record(v.string(), RuleSettingSchema),
  overrides: v.optional(v.array(OverrideSchema), []),
});

const PresetManifestSchema = v.object({
  name: NonEmptyString,
  requires: v.array(v.string()),
  files: v.array(ManagedFileSchema),
  dependencies: v.array(DependencySchema),
  ignoreScripts: v.optional(v.array(NonEmptyString), []),
  oxlint: OxlintSchema,
});

export async function parsePresetManifest(path: string): Promise<PresetManifest> {
  return v.parse(PresetManifestSchema, await file(path).json());
}
