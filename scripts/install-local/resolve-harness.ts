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
