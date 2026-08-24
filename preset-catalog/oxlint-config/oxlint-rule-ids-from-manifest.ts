import type { PresetManifest } from '../contract/preset-contract.types.js';

/** Rule ids contributed by a preset manifest (`oxlint.rules` and override rules). */
export function oxlintRuleIdsFromManifest(manifest: PresetManifest): string[] {
  const ids = new Set<string>(Object.keys(manifest.oxlint.rules));
  for (const override of manifest.oxlint.overrides) {
    for (const ruleId of Object.keys(override.rules)) {
      ids.add(ruleId);
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}
