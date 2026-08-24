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
