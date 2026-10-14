# Verification behavior

At session start, Pi activates `verify` only when `ctx.cwd` is inside a configured project root or its linked git worktree. When roots overlap, the deepest matching root supplies the project configuration. A verify call or `agent_end` outside the allowlist is skipped.

On a terminal `agent_end` (Pi), a completed Cursor stop, a Claude Code Stop hook, or a Codex Stop hook, the same check runs. Pi skips error, length, and aborted endings so its retry and compaction recovery can proceed first. A passing run lets the agent finish. A failing run returns diagnostics and remediation so the agent continues until the gate passes (within the follow-up budget).

Pi system guidance no longer tells agents to call `verify` after every JavaScript or TypeScript edit; the completion/stop hook already runs the gate. Call `verify` mid-task only when you want earlier feedback.

The TypeScript/JavaScript verification pipeline uses the Oxlint and Fallow policy shipped in this package. Project-local Oxlint, Fallow, or tool config files cannot weaken or disable those rules. Tools run with the project root as `cwd` and do not require a project-local installation of `agent-quality-gate`. Verify keeps generated Oxlint/Fallow configs and caches under `.aqg/cache/oxlint/` and `.aqg/cache/fallow/`. When Fallow auto-fix is enabled, it also uses a disposable config under `.aqg/fallow/`, which is removed after the run.

Verify checks managed file content hashes against preset manifests (`contentHash` is stamped at package/build time for shipped presets; source-tree presets fall back to hashing the payload once). Reference examples are refreshed under `.aqg/<preset>/…`; `exampleOnly` files are not checked as project destinations. Managed-file reconciliation reports missing/drifted destinations without copying examples over them. Required `package.json` dependencies and `ignoreScripts` entries are checked read-only; mismatches are reported without installing or editing dependencies. Declared dependencies and devDependencies must also be installed before verification. An exact declared dependency version at or above the manifest's primary `version` is accepted. A dependency's optional `compatibleVersions` lists additional concrete versions accepted by project ranges or below that minimum. Preset preflights and tool checks run as part of verification. Verify also merges preset Oxlint plugins/rules into the packaged policy (manifest `phase: boundaries` vs `lint` controls ordering), and the `baseline` preset is always active and cannot be turned off.

Verification can change project files through configured auto-fixes. The database presets also restore edits/deletions of committed migrations in both the index and working tree and save the discarded diff to `.aqg/restored-migration.diff`.

## Verify pipeline

Preflight validates configured projects, dependency requirements, managed-file hashes, preset preflights, and generates the Oxlint config. Requested auto-fixes run next. A shared Fallow run produces cycle, boundary, hygiene, and complexity results. If cycles fail, verification returns before the read-only Oxlint run or preset tool checks start.

If cycles pass, Oxlint and preset checks run alongside selection of the already-produced Fallow results. Hygiene's duplicate search is a separate Fallow run and starts only when its other hygiene checks pass. The result is selected by precedence, not by execution order:

1. Oxlint virtual groups other than `lint` (default order: `boundaries`, `contracts`, `ui`, `e2e`; boundary rules are subdivided by plugin priority).
2. Preset findings not assigned to an Oxlint group.
3. Fallow `boundary-violation` findings.
4. Oxlint `lint` findings.
5. Fallow hygiene findings, then complexity findings.

The default Oxlint order is `boundaries`, `contracts`, `lint`, `ui`, `e2e`; the list above places `lint` separately because its findings are reported after Fallow boundaries. `verify.lintGroups` and `verify.boundaryPluginPriority` in global config can change the Oxlint group and boundary-plugin order. The default boundary-plugin priority is `module-placement` → `config` → `database` → `database-sqlite` → `playwright`, with unknown plugins after those, alphabetically.

Read-only Oxlint analysis runs once; diagnostics are split into virtual groups, and only the highest-priority failing group is reported. Enabling Oxlint auto-fix adds a preceding `--fix` invocation. Findings in later groups are deferred (`verify: deferred: N` on stderr) until higher-priority findings are cleared. Fallow hygiene's duplicate search is a separate run, launched only when its other hygiene checks pass; test/production clone findings are derived from that run. When a home-installed preset is active, a separate Fallow `ui` run also supplies UI coverage/audit data to preset tool checks. Type-aware Oxlint (via `oxlint-tsgolint`) has a 120s timeout — `hint:type-aware-timeout — .aqg/hints/type-aware-timeout.md` on expiry. Set `AGENT_QUALITY_GATE_VERIFY_TIMING=1` to append `verify-timing:` phase timings to stderr. Set `FALLOW_PATH=/absolute/path/to/fallow` to explicitly choose the Fallow binary; it takes precedence over `$AGENT_QUALITY_GATE_HOME/fallow-custom/bin/fallow` and the packaged dependency.

## Test implementation integrity

Baseline rejects substitution of imported project implementations in tests (`aqg/no-production-test-substitution`). External packages and builtins remain available as controlled boundaries; unresolved module replacement targets fail closed. The database preset no longer permits spies on DAO namespaces. Playwright interception requires explicit external origins in trusted `presets.playwright.externalMockOrigins`; the default list is empty.

After Fallow's non-duplication hygiene checks succeed, verify runs a separate duplication pass including tests. Only clone groups spanning test and non-test code produce `test-production-copy` findings. Production dead-code policy and its thresholds remain unchanged; test-to-test repetition does not fail this additional check. The general `code-duplication` check suppresses test-only clone groups whose instances are all at most five lines long; set `AQG_INCLUDE_SHORT_TEST_DUPLICATES=1` to include them. These are structural clone findings, not proof of assertion quality. Exercise real implementation code rather than copying it into tests, and keep expected results independent.

## Settle/stop follow-up

- Follow-up budget is **3 attempts** (`QUALITY_GATE_FOLLOW_UP_BUDGET`); the final allowed follow-up tells the agent to report any remaining blocker to the user. Claude Code and Codex attempts are tracked per session under `$AGENT_QUALITY_GATE_HOME/<harness>/stop-attempts/`; Pi tracks attempts in memory and Cursor uses its `loop_count`.
- Follow-up is skipped when the last assistant turn asked the user a question: Pi `ask_user`, Cursor `AskQuestion`, Claude Code `AskUserQuestion`, Codex `ask_user_question` or `request_user_input`.
- Core gate failure messages are limited to 5 lines; the remaining output is written to `.aqg/aqg-verify-failure.log`. Pi's explicit `verify` tool appends a retry-guidance line after that message.
- Preset remediation documents are written to `.aqg/hints/presets/<preset>/<hint-id>.md`; built-in hints such as `type-aware-timeout` use `.aqg/hints/<hint-id>.md`.
- Gate infra failures stay off the agent (`verify: unavailable`) and land in `.aqg/aqg-internal-failure.log` or `~/.agent-quality-gate/aqg-internal-failure.log`.
- Verify appends compact run stats by default to `~/.agent-quality-gate/stats/verify-runs.jsonl` (or `$AGENT_QUALITY_GATE_HOME/stats/verify-runs.jsonl`), including runs when no project is configured. Records contain `t`, `r`, `ms`, `path`, and optional `c`, `b`, `l`, `h`, `x`, `pr`, `ws`: Fallow cycles, Fallow boundaries, Oxlint, Fallow hygiene, Fallow complexity, presets, and workspace-root source (`mr` MCP root, `hc` host cwd, `pc` process cwd), respectively. `r` is `0` ok, `1` fail, `-1` skipped/unconfigured.
- Full agent-facing verify text is written under `~/.agent-quality-gate/agent-run-logs/` by default. Set `verify.agentRunLogs: false` in global config to disable these text dumps without disabling compact JSONL run stats.

## Development verification

Local `bun run verify` is this repository's development-only self-verify (`system/scripts/self-verify/self-verify.ts`); it is not included in the released package. It verifies this repo with the packaged Oxlint and Fallow policy and runs preset isolation, package, and pack verification checks (no unit tests). Use `bun run verify:cwd -- <cwd>` to run the same quality-gate path as the MCP/stop-hook tools against any project listed in `~/.agent-quality-gate/config.yaml` (or `AGENT_QUALITY_GATE_HOME/config.yaml`). Use `bun run test` (`system/scripts/self-test/self-test.ts`) for repository and pack unit tests (it builds the release package first). Run pack integration tests separately with `bun run test -- --integration` (requires a container runtime). `bun self-aqg` runs formatting, self-verification, unit tests, and integration tests.

## Optional preset repositories

Optional preset repositories (for example `aqg-presets`) can import `executeVerify`, `writeVerifyStreams`, `parsePresetManifest`, `oxlintRuleIdsFromManifest`, and `runLocalPresetSteps` from `agent-quality-gate/shared/verify`, and shared AST helpers from `agent-quality-gate/shared/oxlint`, to run baseline Oxlint and Fallow against their TypeScript check modules without listing the repo in global config. Compose a `VerifyRequest` (entries, ignorePatterns, fallowIgnoreDependencies, presets, and other fields) and call `executeVerify` directly.
