export const STOP_SESSION_HARNESSES = ['claude', 'codex'] as const;

export type StopSessionHarness = (typeof STOP_SESSION_HARNESSES)[number];
