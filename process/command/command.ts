export function rejectUnexpectedArgument(command: string): boolean {
  const argument = process.argv[2];
  if (argument === undefined) {
    return false;
  }
  process.stderr.write(`${command}: unexpected argument "${argument}"\n`);
  return true;
}

export function reportCommandError(command: string, error: Error | string): void {
  const message = error instanceof Error ? error.message : error;
  process.stderr.write(`${command}: ${message}\n`);
}
