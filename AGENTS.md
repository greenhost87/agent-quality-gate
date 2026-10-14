# Agent Quality Gate - AQG

- Format `bun run fmt`;
- Root test `bun run test`; pack integration `bun run test -- --integration`;
- Single test `bun test system/tests/gate/run/verify.test.ts`;
- Before claim "task completed" you must run test command `bun self-aqg`;
- Install optional preset `bun ./system/install/cli.ts preset /absolute/path/to/preset-root` (writes `$AGENT_QUALITY_GATE_HOME/presets/<name>/`);
- `.quality-fixtures` live with their owning test suites (`adapters/<name>/`, `presets/<name>/`, `system/tests/gate/`, `system/tests/scripts/`). Under `system/tests/gate/`, all cases share one tree: `system/tests/gate/.quality-fixtures/<case>/`. Nested `.quality-fixtures` inside a case only exist to exercise skip behavior. Static golden files stay in `*/tests/fixtures/`.

## Project map

- `system/` — core gate, configuration, installation, scripts, and tests.
- `adapters/` — integrations for Claude, Codex, Cursor, hooks, MCP, and Pi.
- `presets/` — shipped quality-gate presets and their tests.
- `shared/` — reusable verification and Oxlint code.
- `docs/` — configuration, installation, and verification guides.
