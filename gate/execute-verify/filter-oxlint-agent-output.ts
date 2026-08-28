/** Drop oxlint agent-format lines that belong to ignored rule ids (`plugin/rule`). */

import type { OxlintGroupSelection, OxlintOutputGroup } from './execute-verify.js';

const ISSUE_LINE = /:\s*(error|warning)\s+/u;

function oxlintAgentLineMatchesRuleId(line: string, ruleId: string): boolean {
  if (line.includes(ruleId)) {
    return true;
  }
  const separator = ruleId.indexOf('/');
  if (separator === -1) {
    return line.includes(`(${ruleId})`);
  }
  const plugin = ruleId.slice(0, separator);
  const name = ruleId.slice(separator + 1);
  return line.includes(`${plugin}(${name})`);
}

function lineGroupIndex(line: string, groups: readonly OxlintOutputGroup[]): number {
  for (let index = 0; index < groups.length; index += 1) {
    for (const ruleId of groups[index]?.ruleIds ?? []) {
      if (oxlintAgentLineMatchesRuleId(line, ruleId)) {
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
 * Split agent-format oxlint output into ordered virtual phase groups and select only the first
 * non-empty group. Issue lines that match no known rule id fall into the trailing catch-all
 * group. Output without any issue lines is passed through untouched.
 */
export function selectFirstNonEmptyOxlintGroup(
  output: string,
  groups: readonly OxlintOutputGroup[],
  selectedGroupIndex?: number,
): OxlintGroupSelection {
  const catchAllIndex = groups.length;
  const counts = new Array<number>(catchAllIndex + 1).fill(0);
  const lineIndexes: number[] = [];
  let hasIssues = false;

  for (const line of output.split('\n')) {
    let index = catchAllIndex;
    if (ISSUE_LINE.test(line)) {
      hasIssues = true;
      index = lineGroupIndex(line, groups);
      counts[index] = issueCount(counts, index) + 1;
    }
    lineIndexes.push(index);
  }

  if (!hasIssues) {
    return { text: output, deferredCount: 0, hasIssues: false };
  }

  const shownIndex = selectedGroupIndex ?? counts.findIndex((count) => count > 0);
  let deferredCount = 0;
  for (let index = shownIndex + 1; index <= catchAllIndex; index += 1) {
    deferredCount += issueCount(counts, index);
  }

  const text = output
    .split('\n')
    .filter((_, position) => lineIndexes[position] === shownIndex)
    .join('\n');
  return { text, deferredCount, hasIssues: true, groupIndex: shownIndex };
}

export function filterOxlintAgentOutput(
  output: string,
  ignoreRuleIds: ReadonlySet<string>,
): { text: string; hasRemainingIssues: boolean } {
  if (ignoreRuleIds.size === 0 || output.length === 0) {
    return {
      text: output,
      hasRemainingIssues: ISSUE_LINE.test(output),
    };
  }

  const kept: string[] = [];
  for (const line of output.split('\n')) {
    let ignored = false;
    for (const ruleId of ignoreRuleIds) {
      if (oxlintAgentLineMatchesRuleId(line, ruleId)) {
        ignored = true;
        break;
      }
    }
    if (!ignored) {
      kept.push(line);
    }
  }

  const text = kept.join('\n');
  return {
    text,
    hasRemainingIssues: kept.some((line) => ISSUE_LINE.test(line)),
  };
}
