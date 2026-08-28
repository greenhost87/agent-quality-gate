import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { HarnessPresence, HarnessSelection } from './resolve-harness.js';

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
