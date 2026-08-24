import { readProjectPackageJson } from '../../preset-catalog/dependencies/read-project-package-json.ts';
import { formatDatabaseLabeledValues } from './format-database-labeled-values.ts';
import type { DatabaseConcurrencyScriptViolation } from './verify-database-concurrency.types.ts';

function scriptSegments(command: string): string[] {
  return command.split(/(?:&&|\|\||;)/u);
}

function commandInvokesBunTestConcurrent(command: string): boolean {
  for (const segment of scriptSegments(command)) {
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

function scriptsRecord(scripts: object | undefined): Record<string, string> | undefined {
  if (scripts === undefined) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value === 'string') {
      result[name] = value;
    }
  }
  return result;
}

export async function verifyDatabaseConcurrencyScripts(
  projectRoot: string,
): Promise<DatabaseConcurrencyScriptViolation[]> {
  const scripts = scriptsRecord((await readProjectPackageJson(projectRoot))?.scripts);
  if (scripts === undefined) {
    return [];
  }

  const violations: DatabaseConcurrencyScriptViolation[] = [];
  for (const [scriptName, value] of Object.entries(scripts)) {
    if (commandInvokesBunTestConcurrent(value)) {
      violations.push({ scriptName });
    }
  }
  return violations;
}

export function formatDatabaseConcurrencyViolations(
  violations: readonly DatabaseConcurrencyScriptViolation[],
): string {
  return formatDatabaseLabeledValues(
    'database-concurrent-script',
    violations.map((violation) => violation.scriptName),
  );
}
