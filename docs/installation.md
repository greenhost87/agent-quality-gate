# Installation

## Setup and global config

On its first Pi session, the extension creates `~/.agent-quality-gate/config.yaml` (or `$AGENT_QUALITY_GATE_HOME/config.yaml`) from the template and shows the path in a notification. Cursor, Claude Code, and Codex do not create that file; copy `system/configs/global-config.yaml` from a source checkout or `dist/configs/global-config.yaml` from an extracted release before those harnesses will check a project. See the [configuration reference](configuration.md).

## Pi

```bash
pi install git:github.com/greenhost87/agent-quality-gate
```

The Pi extension uses Bun APIs, so its Pi host must run under Bun. If your installed `pi` command launches Node, run its CLI entry point with Bun, for example with a zsh wrapper:

```zsh
pi() {
  bun --bun ~/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/cli.js "$@"
}
```

Adjust the `cli.js` path for your installation. Ensure the `pi` command used to register and run the extension invokes Bun.

## Cursor, Claude Code, and Codex

The MCP tool is `verify` with empty input. If the client does not advertise Roots, AQG uses the host-provided cwd when available, otherwise the MCP process cwd. If it does, AQG requires exactly one local file root; multiple or invalid roots expose no tool. The resolved path must match a configured project root or its corresponding root in a linked git worktree; a subdirectory alone does not expose the MCP tool.

- **Cursor:** the stop hook may return a `followup_message` until the gate passes or the follow-up budget is exhausted.
- **Claude Code:** on a failing Stop run, the hook continues the session with `hookSpecificOutput.additionalContext` until the gate passes or the follow-up budget is exhausted. Wiring writes `~/.claude.json` and `~/.claude/settings.json` only when `~/.claude` already exists.
- **Codex:** on a failing Stop run, the hook continues with `decision: "block"` and a `reason` until the gate passes or the follow-up budget is exhausted. Wiring writes `~/.codex/config.toml` and `~/.codex/hooks.json` only when `~/.codex` already exists.

Install using the CLI:

```bash
bun ./system/install/cli.ts
```

Default install downloads the latest GitHub Release tarball to a temporary directory, extracts its contents into `~/.agent-quality-gate/install` (or `$AGENT_QUALITY_GATE_HOME/install`), installs package dependencies, then wires Pi, Cursor, Claude Code, and/or Codex. The temporary download is removed afterwards. Installing from a source checkout also syncs optional presets found in its `presets/` directory into the AQG home.

From a source checkout:

```bash
bun ./system/install/cli.ts local   # verify, test, integration, build, then install from this tree
bun ./system/install/cli.ts         # download latest release + wire
```

Without a checkout, download the latest `agent-quality-gate-*.tgz` GitHub Release asset, extract it, run `bun install` in the extracted `package/` directory, then `bun dist/install-cli.js` with the release-download/wiring flags below. The `local` and `preset` subcommands belong to the source-checkout CLI.

Harness selection:

- no `--pi` / `--cursor` / `--claude` / `--codex`: all (non-TTY), or an interactive prompt (TTY)
- `--pi` and/or `--cursor` and/or `--claude` and/or `--codex`: only the listed harnesses
- `--wire-only`: wire harnesses into an existing prefix; do not download or rebuild
- if `~/.pi`, `~/.cursor`, `~/.claude`, or `~/.codex` is missing, that harness is skipped (directories are not created)

```bash
bun ./system/install/cli.ts --pi
bun ./system/install/cli.ts --pi --cursor --claude --codex
bun ./system/install/cli.ts --version 2.0.0
bun ./system/install/cli.ts --prefix /tmp/aqg-install
bun ./system/install/cli.ts --wire-only --cursor
```

Cursor MCP/stop-hook entrypoints ship inside the release package under `dist/cursor/`. Wiring updates `~/.cursor/mcp.json` and the agent-quality-gate stop hook in `~/.cursor/hooks.json` only when `~/.cursor` already exists.

Claude Code MCP/Stop-hook entrypoints ship under `dist/claude/`. Wiring merges the `agent-quality-gate` stdio MCP server into `~/.claude.json` and a Stop command hook plus `mcp__agent-quality-gate__verify` on `permissions.allow` into `~/.claude/settings.json` only when `~/.claude` already exists.

Codex MCP/Stop-hook entrypoints ship under `dist/codex/`. Wiring merges the `agent-quality-gate` stdio MCP server into `~/.codex/config.toml` and a Stop command hook into `~/.codex/hooks.json` only when `~/.codex` already exists.
