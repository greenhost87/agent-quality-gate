import type { Diagnostic } from './check-result.js';
import { oxlintDiagnosticMatchesRuleId } from './oxlint-json.js';
import type { OxlintOutputGroup } from './execute-verify.js';

function diagnosticGroupIndex(
  diagnostic: Diagnostic,
  groups: readonly OxlintOutputGroup[],
): number {
  for (let index = 0; index < groups.length; index += 1) {
    for (const ruleId of groups[index]?.ruleIds ?? []) {
      if (oxlintDiagnosticMatchesRuleId(diagnostic, ruleId)) {
        return index;
      }
    }
  }
  return groups.length;
}

function issueCount(counts: readonly number[], index: number): number {
  return counts[index] ?? 0;
}

/**
 * Split structured oxlint diagnostics into ordered virtual phase groups and select only the
 * first non-empty group. Diagnostics without a matching rule id fall into the trailing catch-all.
 */
export function selectFirstNonEmptyOxlintDiagnosticGroup(
  diagnostics: readonly Diagnostic[],
  groups: readonly OxlintOutputGroup[],
  selectedGroupIndex?: number,
): {
  diagnostics: readonly Diagnostic[];
  deferredCount: number;
  hasIssues: boolean;
  groupIndex?: number;
} {
  if (diagnostics.length === 0) {
    return { diagnostics: [], deferredCount: 0, hasIssues: false };
  }

  const catchAllIndex = groups.length;
  const counts = new Array<number>(catchAllIndex + 1).fill(0);
  const indexes: number[] = [];
  for (const diagnostic of diagnostics) {
    const index = diagnosticGroupIndex(diagnostic, groups);
    counts[index] = issueCount(counts, index) + 1;
    indexes.push(index);
  }

  const shownIndex = selectedGroupIndex ?? counts.findIndex((count) => count > 0);
  let deferredCount = 0;
  for (let index = shownIndex + 1; index <= catchAllIndex; index += 1) {
    deferredCount += issueCount(counts, index);
  }

  return {
    diagnostics: diagnostics.filter((_, position) => indexes[position] === shownIndex),
    deferredCount,
    hasIssues: true,
    groupIndex: shownIndex,
  };
}

export function filterIgnoredOxlintDiagnostics(
  diagnostics: readonly Diagnostic[],
  ignoreRuleIds: ReadonlySet<string>,
): { diagnostics: Diagnostic[]; hasRemainingIssues: boolean } {
  if (ignoreRuleIds.size === 0) {
    return {
      diagnostics: [...diagnostics],
      hasRemainingIssues: diagnostics.length > 0,
    };
  }
  const kept = diagnostics.filter((diagnostic) => {
    for (const ruleId of ignoreRuleIds) {
      if (oxlintDiagnosticMatchesRuleId(diagnostic, ruleId)) {
        return false;
      }
    }
    return true;
  });
  return {
    diagnostics: kept,
    hasRemainingIssues: kept.length > 0,
  };
}
