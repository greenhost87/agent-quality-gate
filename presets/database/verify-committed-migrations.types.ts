export type CommittedMigrationViolation = {
  path: string;
};

export type CommittedMigrationCheck =
  | { ok: true; violations: readonly CommittedMigrationViolation[] }
  | { ok: false; error: string };

export type CommittedMigrationRestore = { ok: true } | { ok: false; error: string };

export type GitRun = {
  started: boolean;
  status: number;
  stdout: string;
  stderr: string;
};
