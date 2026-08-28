import { Command, CommanderError } from 'commander';

/** Create a strict CLI program: no excess args, `-h`/`--help`, errors do not `process.exit`. */
export function createCli(name: string): Command {
  return new Command(name)
    .helpOption('-h, --help')
    .allowExcessArguments(false)
    .showHelpAfterError(false)
    .exitOverride()
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
    });
}

function unexpectedFromCommander(error: CommanderError): Error {
  if (error.code === 'commander.unknownOption') {
    const match = /unknown option '([^']+)'/u.exec(error.message);
    return new Error(`unexpected argument "${match?.[1] ?? 'unknown'}"`, { cause: error });
  }
  if (error.code === 'commander.excessArguments') {
    const match = /got \d+: (.+)\.\s*$/u.exec(error.message);
    const parts = match?.[1]?.split(',').map((part) => part.trim()) ?? [];
    const unexpected = parts.at(-1);
    return new Error(`unexpected argument "${unexpected ?? 'unknown'}"`, { cause: error });
  }
  if (error.code === 'commander.missingArgument') {
    const match = /missing required argument '([^']+)'/u.exec(error.message);
    const name = match?.[1] ?? 'argument';
    if (name === 'version') {
      return new Error('missing version (expected X.Y.Z)', { cause: error });
    }
    return new Error(`missing ${name}`, { cause: error });
  }
  const message = error.message.replace(/^error:\s*/iu, '');
  return new Error(message, { cause: error });
}

/**
 * Parse `argv` (user args only, no node/bun binary).
 * Returns `'help'` when `-h` / `--help` was requested.
 */
export function parseCli(program: Command, argv: readonly string[]): 'help' | undefined {
  try {
    program.parse([...argv], { from: 'user' });
    return undefined;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.help') {
        return 'help';
      }
      throw unexpectedFromCommander(error);
    }
    throw error;
  }
}

/** Parse CLI args; print `usage` and return on help; otherwise run `action`. */
export async function runCli(
  program: Command,
  argv: readonly string[],
  usage: string,
  action: () => void | Promise<void>,
): Promise<void> {
  if (parseCli(program, argv) === 'help') {
    process.stdout.write(usage.endsWith('\n') ? usage : `${usage}\n`);
    return;
  }
  await action();
}

export function reportCommandError(command: string, error: Error | string): void {
  const message = error instanceof Error ? error.message : error;
  process.stderr.write(`${command}: ${message}\n`);
}
