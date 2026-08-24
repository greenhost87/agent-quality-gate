import { createInterface } from 'node:readline/promises';
import { createReadStream, createWriteStream } from 'node:fs';

import type { HarnessChoice } from './resolve-harness.types.js';

function parseChoice(raw: string): HarnessChoice | undefined {
  const value = raw.trim().toLowerCase();
  if (
    value === '' ||
    value === '1' ||
    value === 'all' ||
    value === 'a' ||
    value === 'both' ||
    value === 'b'
  ) {
    return 'all';
  }
  if (value === '2' || value === 'pi' || value === 'p') {
    return 'pi';
  }
  if (value === '3' || value === 'cursor' || value === 'c') {
    return 'cursor';
  }
  if (value === '4' || value === 'claude') {
    return 'claude';
  }
  if (value === '5' || value === 'codex') {
    return 'codex';
  }
  return undefined;
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
      const choice = parseChoice(answer);
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
