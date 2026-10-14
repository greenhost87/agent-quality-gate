import { createHash } from 'node:crypto';

import { file } from 'bun';
import * as v from 'valibot';

import {
  OXLINT_RULE_PHASES,
  OXLINT_RULE_SEVERITIES,
  type OxlintRuleSetting,
} from './write-oxlint-config.js';
import type { PresetManifest } from './preset-contract.types.js';
import { PRESET_DEPENDENCY_SECTIONS } from './preset-contract.types.js';

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
  compatibleVersions: v.optional(v.pipe(v.array(NonEmptyString), v.minLength(1))),
  section: v.picklist(PRESET_DEPENDENCY_SECTIONS),
});

const OxlintPluginSchema = v.object({
  name: NonEmptyString,
  specifier: NonEmptyString,
});

const RuleSeveritySchema = v.picklist(OXLINT_RULE_SEVERITIES);

const RulePhaseSchema = v.picklist(OXLINT_RULE_PHASES);

const RuleObjectSchema = v.object({
  severity: RuleSeveritySchema,
  options: v.optional(v.looseObject({})),
  phase: v.optional(RulePhaseSchema),
});

const RuleSettingSchema: v.GenericSchema<OxlintRuleSetting> = v.union([
  RuleSeveritySchema,
  v.tuple([RuleSeveritySchema, v.looseObject({})]),
  RuleObjectSchema,
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

const FallowSchema = v.object({
  rules: v.optional(v.record(NonEmptyString, NonEmptyString), {}),
  checkKeys: v.optional(v.array(NonEmptyString), []),
});

const PresetManifestSchema = v.object({
  name: NonEmptyString,
  requires: v.array(v.string()),
  files: v.array(ManagedFileSchema),
  dependencies: v.array(DependencySchema),
  ignoreScripts: v.optional(v.array(NonEmptyString), []),
  fallow: v.optional(FallowSchema, { rules: {}, checkKeys: [] }),
  oxlint: v.optional(OxlintSchema, {
    nativePlugins: [],
    plugins: [],
    rules: {},
    overrides: [],
  }),
});

export async function parsePresetManifest(path: string): Promise<PresetManifest> {
  return v.parse(PresetManifestSchema, await file(path).json());
}

/** SHA-256 hex digest of file bytes (managed preset content identity). */
export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
