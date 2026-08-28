# Agent Quality Gate - AQG

- Format `bun run fmt`;
- Root test `bun run test`; pack integration `bun run test -- --integration`;
- Single test `bun test gate/tests/verify.test.ts`;
- Before claim "task completed" you must run root project: `bun run verify`, `bun run test`, `bun run test -- --integration`;
- Install optional preset `bun ./install.ts preset /absolute/path/to/preset-root` (writes `$AGENT_QUALITY_GATE_HOME/presets/<name>/`);
- `.quality-fixtures` live at the owner root as a sibling of `tests/` (`adapters/<name>/`, `presets/<name>/`, `gate/`, `scripts/tests/`). Under `gate/`, all cases share one tree: `gate/.quality-fixtures/<case>/`. Nested `.quality-fixtures` inside a case only exist to exercise skip behavior. Static golden files stay in `*/tests/fixtures/`.
