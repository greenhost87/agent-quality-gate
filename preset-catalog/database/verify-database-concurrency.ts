import { readProjectPackageJson } from '../dependencies/read-project-package-json.ts';

function commandInvokesBunTestConcurrent(command: string): boolean {
  for (const segment of command.split(/(?:&&|\|\||;)/u)) {
    const tokens = segment
      .trim()
      .split(/\s+/u)
      .filter((token) => token.length > 0);
    let commandIndex = 0;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(tokens[commandIndex] ?? '')) {
      commandIndex += 1;
    }
    if (tokens[commandIndex] !== 'bun' || tokens[commandIndex + 1] !== 'test') {
      continue;
    }
    if (
      tokens
        .slice(commandIndex + 2)
        .some((token) => token === '--concurrent' || token.startsWith('--concurrent='))
    ) {
      return true;
    }
  }
  return false;
}

export async function verifyDatabaseConcurrencyScripts(
  projectRoot: string,
): Promise<DatabaseConcurrencyScriptViolation[]> {
  const scripts = (await readProjectPackageJson(projectRoot))?.scripts;
  if (scripts === undefined) {
    return [];
  }

  const violations: DatabaseConcurrencyScriptViolation[] = [];
  for (const [scriptName, value] of Object.entries(scripts)) {
    if (typeof value === 'string' && commandInvokesBunTestConcurrent(value)) {
      violations.push({ scriptName });
    }
  }
  return violations;
}

export function formatDatabaseConcurrencyViolations(
  violations: readonly DatabaseConcurrencyScriptViolation[],
): string {
  return violations
    .map((violation) => `database-concurrent-script:${violation.scriptName}`)
    .join('\n');
}

export type DatabaseConcurrencyScriptViolation = {
  scriptName: string;
};
