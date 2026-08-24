export const OUTDATED_MODES = ['outdated', 'update'] as const;

export type OutdatedMode = (typeof OUTDATED_MODES)[number];

export type OutdatedArgs = {
  mode: OutdatedMode;
};

export type ParseOutdatedArgsResult = OutdatedArgs | 'help';
