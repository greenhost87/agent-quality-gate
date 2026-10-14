/** Single home for repo-wide numeric tuning knobs (timeouts, budgets). */

// Client-facing limits wired into MCP and stop-hook configs by system/scripts/install-local.
export const MCP_STARTUP_TIMEOUT_SECONDS = 30;
export const MCP_TOOL_TIMEOUT_SECONDS = 120;
export const STOP_HOOK_TIMEOUT_SECONDS = 120;

// Type-aware oxlint run kill timeout in system/gate/execute-verify.
export const TYPE_AWARE_OXLINT_TIMEOUT_MS = 120_000;
export const TYPE_AWARE_OXLINT_TIMEOUT_HINT =
  'hint:type-aware-timeout — .aqg/hints/type-aware-timeout.md';

// `bun test --timeout` resolution in system/scripts/self-test (plus AQG_TEST_TIMEOUT_MS override).
export const DEFAULT_BUN_TEST_TIMEOUT_MS = 30_000;
export const SLOW_CI_BUN_TEST_TIMEOUT_MS = 120_000;

// Stop-hook verify follow-up attempts in system/gate/quality-gate-run.
export const QUALITY_GATE_FOLLOW_UP_BUDGET = 3;
