/** Drop oxlint agent-format lines that belong to ignored rule ids (`plugin/rule`). */

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
