import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { createReadStream, createWriteStream } from 'node:fs';

function selectionFromChoice(choice: HarnessChoice): HarnessSelection {
  if (choice === 'pi') {
    return { wirePi: true, wireCursor: false, wireClaude: false, wireCodex: false };
  }
  if (choice === 'cursor') {
    return { wirePi: false, wireCursor: true, wireClaude: false, wireCodex: false };
  }
  if (choice === 'claude') {
    return { wirePi: false, wireCursor: false, wireClaude: true, wireCodex: false };
  }
  if (choice === 'codex') {
    return { wirePi: false, wireCursor: false, wireClaude: false, wireCodex: true };
  }
  return { wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true };
}

export function resolveHarnessSelection(input: ResolveHarnessInput): HarnessSelection {
  if (input.piFlag || input.cursorFlag || input.claudeFlag || input.codexFlag) {
    return {
      wirePi: input.piFlag,
      wireCursor: input.cursorFlag,
      wireClaude: input.claudeFlag,
      wireCodex: input.codexFlag,
    };
  }
  if (input.isTTY) {
    return selectionFromChoice(input.prompt());
  }
  return { wirePi: true, wireCursor: true, wireClaude: true, wireCodex: true };
}

export const HARNESS_CHOICES = ['all', 'pi', 'cursor', 'claude', 'codex'] as const;
export type HarnessChoice = (typeof HARNESS_CHOICES)[number];

export type HarnessSelection = {
  wirePi: boolean;
  wireCursor: boolean;
  wireClaude: boolean;
  wireCodex: boolean;
};

export type ResolveHarnessInput = {
  piFlag: boolean;
  cursorFlag: boolean;
  claudeFlag: boolean;
  codexFlag: boolean;
  isTTY: boolean;
  prompt: () => HarnessChoice;
};

export type HarnessPresence = {
  piHomePresent: boolean;
  cursorHomePresent: boolean;
  claudeHomePresent: boolean;
  codexHomePresent: boolean;
};

export function piHomePath(home: string = homedir()): string {
  return join(home, '.pi');
}

export function cursorHomePath(home: string = homedir()): string {
  return join(home, '.cursor');
}

export function claudeHomePath(home: string = homedir()): string {
  return join(home, '.claude');
}

export function codexHomePath(home: string = homedir()): string {
  return join(home, '.codex');
}

export function detectHarnessPresence(home: string = homedir()): HarnessPresence {
  return {
    piHomePresent: existsSync(piHomePath(home)),
    cursorHomePresent: existsSync(cursorHomePath(home)),
    claudeHomePresent: existsSync(claudeHomePath(home)),
    codexHomePresent: existsSync(codexHomePath(home)),
  };
}

/** Drop harnesses whose home directory is missing; do not create those directories. */
export function applyHarnessPresence(
  selection: HarnessSelection,
  presence: HarnessPresence,
): HarnessSelection {
  return {
    wirePi: selection.wirePi && presence.piHomePresent,
    wireCursor: selection.wireCursor && presence.cursorHomePresent,
    wireClaude: selection.wireClaude && presence.claudeHomePresent,
    wireCodex: selection.wireCodex && presence.codexHomePresent,
  };
}

const HARNESS_CHOICE_ALIASES: Readonly<Record<string, HarnessChoice>> = {
  '': 'all',
  '1': 'all',
  all: 'all',
  a: 'all',
  both: 'all',
  b: 'all',
  '2': 'pi',
  pi: 'pi',
  p: 'pi',
  '3': 'cursor',
  cursor: 'cursor',
  c: 'cursor',
  '4': 'claude',
  claude: 'claude',
  '5': 'codex',
  codex: 'codex',
};

export function parseHarnessChoice(raw: string): HarnessChoice | undefined {
  return HARNESS_CHOICE_ALIASES[raw.trim().toLowerCase()];
}

export async function promptHarnessChoice(): Promise<HarnessChoice> {
  const input = createReadStream('/dev/tty');
  const output = createWriteStream('/dev/tty');
  const rl = createInterface({ input, output, terminal: true });
  try {
    for (;;) {
      output.write(`Install harness integrations:
  1) All (Pi, Cursor, Claude Code, and Codex) (default)
  2) Pi only
  3) Cursor only
  4) Claude Code only
  5) Codex only
Enter choice [1]: `);
      const answer = await rl.question('');
      const choice = parseHarnessChoice(answer);
      if (choice !== undefined) {
        return choice;
      }
      output.write('Please enter 1, 2, 3, 4, or 5.\n');
    }
  } finally {
    rl.close();
    input.destroy();
    output.end();
  }
}
