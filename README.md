# agent-quality-gate

[![CI](https://github.com/greenhost87/agent-quality-gate/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/greenhost87/agent-quality-gate/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/greenhost87/agent-quality-gate)](https://github.com/greenhost87/agent-quality-gate/releases/latest)
[![License](https://img.shields.io/github/license/greenhost87/agent-quality-gate)](LICENSE)

`agent-quality-gate` is an opinionated, tamper-resistant Oxlint and Fallow quality gate for AI-assisted Bun + TypeScript work. It enforces a fixed house layout (optional packs use `system/` and related paths), not a generic per-repo linter framework. The checked project does not install this package.

## Requirements

- macOS or Linux on ARM64 or x64. Windows is not supported.
- Bun 1.4.0 or newer (Bun is the only supported runtime).

## Trust boundary

Gate policy lives outside the checked repository so an agent cannot disable or weaken it through ordinary project edits.

| Zone                                                                            | Who writes it                                | What the agent can change                                                   |
| ------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| `~/.agent-quality-gate/config.yaml` (or `$AGENT_QUALITY_GATE_HOME/config.yaml`) | human / install                              | nothing                                                                     |
| Target repository                                                               | agent                                        | application code, not gate policy                                           |
| Managed preset destinations                                                     | human copies from `.aqg/<preset>/…` examples | content must match preset `contentHash`; verify never rewrites destinations |
| Project-local Oxlint / Fallow / tool config                                     | agent                                        | cannot weaken or disable shipped rules                                      |

Adoption is: a human edits gate config once (roots, entries, presets, optional `modulePlacement` / `packageBoundaries`); the project adopts the preset layout; the agent keeps code inside that contract.

## Supported harnesses

- [Pi](https://github.com/earendil-works/pi): coding-agent extension that registers a `verify` tool and re-runs the gate on `agent_settled`. Requires Pi itself to run under Bun (see [Pi](#pi) below).
- Cursor: MCP `verify` tool plus a stop hook that re-runs the gate when the agent status is `completed`.
- Claude Code: MCP `verify` tool plus a Stop command hook. CLI TUI, the VS Code extension, and the Desktop Code tab share user-scope `~/.claude.json` and `~/.claude/settings.json`.
- Codex: MCP `verify` tool plus a Stop command hook. CLI TUI, the VS Code extension, and the ChatGPT desktop app share user-scope `~/.codex/config.toml` and `~/.codex/hooks.json`.

Pi, Cursor, Claude Code, and Codex share `~/.agent-quality-gate/config.yaml`.

## Setup

### Global config

On its first Pi session, the extension creates `~/.agent-quality-gate/config.yaml` from the packaged template and shows the path in a notification. Cursor, Claude Code, and Codex do not create that file; copy the template or create it before those harnesses will check a project. Edit it: set each project's absolute `root` and project-relative Fallow `entries`.

```yaml
projects:
  - root: /absolute/path/to/project
    entries:
      - src/index.ts
```

Roots must be absolute and unique. `entries` must be a non-empty list of project-relative globs. Workspaces that are not under a configured root, and are not a git worktree of one, are not checked automatically. Missing `~/.agent-quality-gate/config.yaml` means no workspace is checked.

### Pi

```bash
pi install git:github.com/greenhost87/agent-quality-gate
```

The Pi extension uses Bun APIs and only loads when the Pi process runs under Bun. A default npm, Homebrew (`pi-coding-agent`), or `bun install -g` install uses a `#!/usr/bin/env node` entrypoint, so plain `pi` fails to load the extension (`globalThis.Bun` is undefined). Run Pi with Bun, for example a zsh wrapper:

```zsh
pi() {
  bun --bun ~/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/cli.js "$@"
}
```

Adjust the `cli.js` path if your global install lives elsewhere. Official Bun-compiled release binaries from [Pi releases](https://github.com/earendil-works/pi/releases) (`pi-darwin-arm64.tar.gz` and siblings) also provide a Bun host. Homebrew and `https://pi.dev/install.sh` install the Node package, not that binary.

### Cursor

Run `./install.sh` (or the curl bootstrap) so MCP and the stop hook point at the installed `dist/cursor/` bundles. The MCP tool is `verify` and requires an absolute workspace `cwd`. The stop hook may return a `followup_message` until the gate passes or the follow-up budget is exhausted.

### Claude Code

Run `./install.sh` (or the curl bootstrap) so user-scope MCP and the Stop hook point at the installed `dist/claude/` bundles. The MCP tool is `verify` and requires an absolute workspace `cwd`. On a failing Stop run, the hook continues the session with `hookSpecificOutput.additionalContext` until the gate passes or the follow-up budget is exhausted. Wiring writes `~/.claude.json` and `~/.claude/settings.json` only when `~/.claude` already exists.

### Codex

Run `./install.sh` (or the curl bootstrap) so user-scope MCP and the Stop hook point at the installed `dist/codex/` bundles. The MCP tool is `verify` and requires an absolute workspace `cwd`. On a failing Stop run, the hook continues the session with `decision: "block"` and a `reason` until the gate passes or the follow-up budget is exhausted. Wiring writes `~/.codex/config.toml` and `~/.codex/hooks.json` only when `~/.codex` already exists.

## Usage

Pi exposes `verify` only when `ctx.cwd` is inside a configured project root, or inside a git worktree that shares that project's repository. The deepest matching ancestor root wins when more than one configured root contains the working directory. Workspaces outside the allowlist do not see the tool and are not checked on `agent_settled`.

On `agent_settled` (Pi), a completed Cursor stop, a Claude Code Stop hook, or a Codex Stop hook, the same check runs. A passing run lets the agent finish. A failing run returns diagnostics and remediation so the agent continues until the gate passes (within the follow-up budget).

Pi system guidance no longer tells agents to call `verify` after every JavaScript or TypeScript edit; the settle/stop hook already runs the gate. Call `verify` mid-task only when you want earlier feedback.

The check uses the Oxlint and Fallow policy shipped in this package. Project-local Oxlint, Fallow, or tool config files cannot weaken or disable those rules. Tools run with the project root as `cwd` and do not require a project-local installation of `agent-quality-gate`. Each run writes ephemeral Oxlint/Fallow configs under `.aqg/oxlint/` and `.aqg/fallow/` with per-call run ids so parallel agents in the same workspace do not clobber each other; those files are removed after the run.

When presets are enabled, verify checks managed file content hashes against preset manifests (`contentHash` is stamped at package/build time for shipped presets; source-tree presets fall back to hashing the payload once). Examples are refreshed under `.aqg/<preset>/…`; project destinations are never rewritten. Required `package.json` dependencies / `ignoreScripts` are checked read-only and reported as plain missing/incompatible messages. Verify also merges preset Oxlint plugins/rules into the packaged policy. The `baseline` preset is always active and cannot be turned off; project `presets` only add optional packs.

### Settle/stop follow-up

- Follow-up budget is **3 attempts**, then the hook stops and tells the agent to report the blocker to the user.
- Follow-up is skipped when the last assistant turn asked the user a question: Pi `ask_user`, Cursor `AskQuestion`, Claude Code `AskUserQuestion`, Codex `ask_user_question` or `request_user_input`.
- Failures longer than 50 diagnostic lines keep a short in-band head and write the rest to `.aqg/aqg-verify-failure.log`.
- Gate infra failures stay off the agent (`verify: unavailable`) and land in `.aqg/aqg-internal-failure.log` or `~/.agent-quality-gate/aqg-internal-failure.log`.
- Verify appends compact run stats to `~/.agent-quality-gate/stats/verify-runs.jsonl` (`t`, `r`, `ms`, `path`, plus optional phase timings), including runs when no project is configured.

## Configuration

Supported project fields:

```yaml
projects:
  - root: /absolute/path/to/app
    entries:
      - src/index.ts
      - bin/*.ts
    ignorePatterns:
      - migrations/**
    presets:
      - bun-parse
      - config
      - database
      - playwright
      - module-placement
      # packages   # home-installed only (see below)
    modulePlacement:
      directories:
        - system/agents
      rootExceptions:
        system/agents:
          - agents.types.ts
    baseline:
      maxInlineParameterObjectMembers: 3
  - root: /absolute/path/to/app/packages/nested
    entries:
      - src/main.ts
```

- `projects` is the allowlist.
- `root` is an absolute filesystem path. Nested roots win over shallower ancestors for the same `cwd`. A git worktree of a configured root uses that project's presets and other fields; verify runs against the worktree.
- `entries` are project-relative Fallow entry globs. Exports from these files are treated as used.
- `ignorePatterns` is an optional list of project-relative globs merged into the packaged Fallow/Oxlint ignore list for that project.
- `presets` is an optional list of shipped names from `presets/*/manifest.json` and home-installed names from `$AGENT_QUALITY_GATE_HOME/presets/<name>/` (install with `bun run install:preset -- <absolute-source-root>` or `aqg-presets` `bun run install`). Resolution order: shipped, then home install. `baseline` is always active (listing it is redundant; omitting `presets` still runs it). Required optional presets are activated transitively (for example `database` pulls in `config`). Unknown names fail config load (including absolute filesystem paths). Details live in each shipped preset's README under `presets/<name>/`.
- `modulePlacement` is allowed when `presets` includes `module-placement`. It lists watched directories and optional per-directory root filenames. Without this block, the preset is a no-op.
- `packageBoundaries` is allowed when `presets` includes the home-installed name `packages` (this package does not ship `packages`). It declares root modules and the allowed `@/…` import graph between packages; agents in the target repo cannot widen it.
- `baseline.maxInlineParameterObjectMembers` caps members on inline object types in parameters (`aqg/max-inline-parameter-object-members`). Omit the block or use `-1` to leave the rule inactive; a non-negative integer enables the cap.

### Shipped presets

| Preset                 | Gate-config options                        | Hardcoded contract (not remappable from config)                                     |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `baseline` (always on) | `baseline.maxInlineParameterObjectMembers` | TypeScript house rules (type-only files, aliases, unions, …)                        |
| `bun-parse`            | none                                       | Ban recursive handmade JSON ADTs / plain-object typeof guards; prefer Bun + valibot |
| `config`               | none                                       | Env access only via managed `system/config/environment.ts`                          |
| `database`             | none                                       | `system/database/`, `tests/setup/testDatabase*.ts`, `migrations/`, DAO layout       |
| `playwright`           | none                                       | `tests/e2e/**/*.pw.ts`; blocks DAO / `system/database` imports                      |
| `module-placement`     | `modulePlacement`                          | Concern-depth rule under configured directories                                     |

Home-installed only (for example from `aqg-presets`): `packages` (`packageBoundaries` in gate config). Manifest destinations cannot be remapped from `config.yaml`.

```yaml
# Only when the home-installed `packages` preset is active:
presets:
  - packages
packageBoundaries:
  allowedRootModules:
    - config.ts
    - instrumentation.ts
  declaredDependencies:
    orders:
      - shopify
```

## Development

```bash
bun install --frozen-lockfile
bun run fmt
bun run verify
bun run verify:cwd -- /absolute/path/to/configured/project
bun run test
```

### Install

Default install downloads the latest GitHub Release tarball into `~/.agent-quality-gate/install` (or `$AGENT_QUALITY_GATE_HOME/install`), installs package dependencies, then wires Pi, Cursor, Claude Code, and/or Codex.

From a source checkout:

```bash
./install.sh --local-build    # build artifacts/agent-quality-gate-*.tgz from this tree
./install.sh                  # download latest release (same as a non-checkout install)
```

Without a checkout (for example `curl -fsSL …/install.sh | bash`), the script downloads the release tarball, extracts it, and runs the packaged `dist/install-cli.js` to wire harnesses.

Harness selection:

- no `--pi` / `--cursor` / `--claude` / `--codex`: all (non-TTY), or an interactive prompt (TTY)
- `--pi` and/or `--cursor` and/or `--claude` and/or `--codex`: only the listed harnesses
- `--wire-only`: wire harnesses into an existing prefix; do not download or rebuild
- if `~/.pi`, `~/.cursor`, `~/.claude`, or `~/.codex` is missing, that harness is skipped (directories are not created)

```bash
./install.sh --pi
./install.sh --cursor
./install.sh --claude
./install.sh --codex
./install.sh --pi --cursor
./install.sh --pi --cursor --claude
./install.sh --pi --cursor --claude --codex
./install.sh --version 1.0.0
./install.sh --prefix /tmp/aqg-install
./install.sh --wire-only --cursor
```

Cursor MCP/stop-hook entrypoints ship inside the release package under `dist/cursor/`. Wiring updates `~/.cursor/mcp.json` and the agent-quality-gate stop hook in `~/.cursor/hooks.json` only when `~/.cursor` already exists.

Claude Code MCP/Stop-hook entrypoints ship under `dist/claude/`. Wiring merges the `agent-quality-gate` stdio MCP server into `~/.claude.json` and a Stop command hook plus `mcp__agent-quality-gate__verify` on `permissions.allow` into `~/.claude/settings.json` only when `~/.claude` already exists.

Codex MCP/Stop-hook entrypoints ship under `dist/codex/`. Wiring merges the `agent-quality-gate` stdio MCP server into `~/.codex/config.toml` and a Stop command hook into `~/.codex/hooks.json` only when `~/.codex` already exists.

Local `bun run verify` is this repository's development-only self-verify (`scripts/self-verify/self-verify.ts`); it is not included in the released package. It verifies this repo with the packaged Oxlint and Fallow policy (no unit tests). Use `bun run verify:cwd -- <cwd>` to run the same quality-gate path as the MCP/stop-hook tools against any project listed in `~/.agent-quality-gate/config.yaml` (or `AGENT_QUALITY_GATE_HOME/config.yaml`). Use `bun run test` (`scripts/self-test/self-test.ts`) for the repository and pack test suites (it builds the release package first).

Optional preset repositories (for example `aqg-presets`) can import `baselinePresetRepositoryVerifyRequest`, `executeVerify`, `writeVerifyStreams`, `parsePresetManifest`, `oxlintRuleIdsFromManifest`, and `runLocalPresetSteps` from `agent-quality-gate/verify`, and shared AST helpers from `agent-quality-gate/oxlint-walk`, to run baseline Oxlint and Fallow against their TypeScript check modules without listing the repo in global config.

## License

MIT. See [LICENSE](LICENSE).
