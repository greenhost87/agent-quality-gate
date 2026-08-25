# Agent Quality Gate - AQG

- Lint `bun run verify`;
- Format `bun run fmt`;
- Single test `bun test gate/tests/verify.test.ts`;
- Root test `bun run test`;
- Pack verify `bun run verify` under one `presets/<name>/` for a focused pack run (lint + typecheck);
- Install optional preset `bun run install:preset -- /absolute/path/to/preset-root` (writes `$AGENT_QUALITY_GATE_HOME/presets/<name>/`);
- Local `bun run verify` (`scripts/self-verify/self-verify.ts`) runs isolation, colocation, root gate, package `executeVerify`, and pack lint/typecheck (no unit tests);
- Local `bun run test` (`scripts/self-test/self-test.ts`) builds the release package, runs the root Bun suite, then pack unit tests (installs pack deps when needed);
- Local `bun run fmt` (`scripts/self-fmt/self-fmt.ts`) formats the repository (skipping packs that declare `fmt`) and every pack `fmt` script;
- Local `bun run outdated` (`scripts/outdated/outdated.ts`) runs `bun outdated` in the project root and every preset pack with a lockfile; `bun run outdated -- --update` runs `bun update --latest` in the same roots; `--cwd <path>` selects the project root (defaults to the current working directory);
- Tests live next to their owner (`adapters/*/tests`, `scripts/tests`, `scripts/*/tests`, `gate/tests`, `presets/*/tests`); `*.test.ts`, `*.spec.ts`, and `*.bench.ts` follow the same rule; shared helpers only under `tests/support/`;
- `.quality-fixtures` live at the owner root as a sibling of `tests/` (`adapters/<name>/`, `presets/<name>/`, `gate/`, `scripts/tests/`). Under `gate/`, all cases share one tree: `gate/.quality-fixtures/<case>/`. Nested `.quality-fixtures` inside a case only exist to exercise skip behavior. Static golden files stay in `*/tests/fixtures/`.
- Bun documentation - https://bun.com/llms.txt
