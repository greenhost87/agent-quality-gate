/** Single home for repo-wide numeric tuning knobs (timeouts, budgets). */

// Stop-hook `timeout` wired into Cursor/Claude/Codex configs by scripts/install-local.
export const STOP_HOOK_TIMEOUT_SECONDS = 120;

// Type-aware oxlint run kill timeout in gate/execute-verify.
export const TYPE_AWARE_OXLINT_TIMEOUT_MS = 120_000;
export const TYPE_AWARE_OXLINT_TIMEOUT_HINT =
  'hint:type-aware-timeout — .aqg/hints/type-aware-timeout.md';

// Fallow viz kill timeout for optional presets that run `fallow viz`, and the collapse-types script.
export const FALLOW_VIZ_TIMEOUT_MS = 120_000;

// `bun test --timeout` resolution in scripts/self-test (plus AQG_TEST_TIMEOUT_MS override).
export const DEFAULT_BUN_TEST_TIMEOUT_MS = 30_000;
export const SLOW_CI_BUN_TEST_TIMEOUT_MS = 120_000;

// Stop-hook verify follow-up attempts in gate/quality-gate-run.
export const QUALITY_GATE_FOLLOW_UP_BUDGET = 3;
