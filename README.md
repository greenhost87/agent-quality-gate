<p align="center">
  <img src="https://raw.githubusercontent.com/greenhost87/agent-quality-gate/main/.github/readme-banner.jpg" alt="Agent Quality Gate banner" width="100%">
</p>

# Agent quality gate (AQG)

[![CI](https://github.com/greenhost87/agent-quality-gate/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/greenhost87/agent-quality-gate/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/greenhost87/agent-quality-gate)](https://github.com/greenhost87/agent-quality-gate/releases/latest)
[![License](https://img.shields.io/github/license/greenhost87/agent-quality-gate)](LICENSE)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/greenhost87/agent-quality-gate?utm_source=oss&utm_medium=github&utm_campaign=greenhost87%2Fagent-quality-gate&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

`agent quality gate` is a tamper-resistant quality-gate harness for AI-assisted work. It provides an opinionated Oxlint and Fallow policy for Bun + TypeScript projects. The checked project does not install this package.

## Requirements

- macOS or Linux on ARM64 or x64. Windows is not supported.
- Bun 1.4.0 or newer (Bun is the only supported runtime).

## Trust boundary

Gate policy lives outside the checked repository so an agent cannot disable or weaken it through ordinary project edits.

| Zone                                                                            | Who writes it                                | What the agent can change                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| `~/.agent-quality-gate/config.yaml` (or `$AGENT_QUALITY_GATE_HOME/config.yaml`) | human / install                              | nothing                                                                        |
| Target repository                                                               | agent                                        | application code, not gate policy                                              |
| Managed preset destinations                                                     | human copies from `.aqg/<preset>/…` examples | managed-file verification reports missing/drifted files and refreshes examples |
| Project-local Oxlint / Fallow / tool config                                     | agent                                        | cannot weaken or disable shipped rules                                         |

Adoption is: a human edits gate config once (roots, entries, and presets); the agent keeps code inside the project's preset contracts.

Verification can edit project files when `autoFix.oxlint` or `autoFix.fallow` is enabled in global config. The database presets also restore edits/deletions of committed migrations and save the discarded diff under `.aqg/restored-migration.diff`.

## Supported harnesses

- [Pi](https://github.com/earendil-works/pi): extension registering a `verify` tool and re-running the gate at `agent_end`. Pi must run under Bun.
- Cursor: MCP `verify` tool plus a stop hook.
- Claude Code: MCP `verify` tool plus a Stop command hook.
- Codex: MCP `verify` tool plus a Stop command hook.

All harnesses share `~/.agent-quality-gate/config.yaml`.

## Get started

1. Install the extension/package for your harness using the [installation guide](docs/installation.md).
2. Create `~/.agent-quality-gate/config.yaml` from the template (`system/configs/global-config.yaml` in a source checkout, `dist/configs/global-config.yaml` in an extracted release) and add your project root, entries, and presets. Pi creates an empty config from that template on its first session.
3. See the [configuration reference](docs/configuration.md) for supported fields and shipped presets.

For details on gate behavior and verification results, see the [verification guide](docs/verification.md).

## Development

```bash
bun install --frozen-lockfile
bun run fmt
bun run verify
bun run verify:cwd -- /absolute/path/to/configured/project
bun run test
bun run test -- --integration  # requires a container runtime
bun self-aqg
```

Install a specific release from a source checkout:

```bash
bun ./system/install/cli.ts --version 2.0.0
```

Optional preset repositories can use the [shared verification API](docs/verification.md#optional-preset-repositories).

## License

MIT. See [LICENSE](LICENSE).
