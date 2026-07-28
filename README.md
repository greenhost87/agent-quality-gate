# agent-quality-gate

`agent-quality-gate` is a locked Oxlint and Fallow quality gate for AI-assisted TypeScript and JavaScript projects.

## Status

- The repository is not published to a package registry.
- Official install channels are Git tags and GitHub Release package tarballs.
- External pull requests are currently not accepted.
- Bug reports, documentation problems, and feature ideas should go through issues.

## Requirements

- macOS or Linux on ARM64 or x64 is required. Windows is not supported.
- Node.js 22.12.0 or newer is required to run the packaged Oxlint and Fallow launchers.
- Bun 1.3.14 or newer is required only for repository development and release builds.

## Install

Install the release package:

```bash
bun add -d \
  https://github.com/greenhost87/agent-quality-gate/releases/download/v0.3.0/agent-quality-gate-0.3.0.tgz
```

The package contains the `verify` launcher and locked policies. Its pinned Oxlint, TypeScript-Go, and Fallow dependencies are installed normally, including only the binaries required by the current platform.

Use the package binary from a script:

```json
{
  "scripts": {
    "verify": "verify"
  }
}
```

## Usage

```bash
verify
verify --timings
verify --help
```

- Every stage runs and streams its output directly without filtering or buffering.
- `--timings` prints stage and total durations.
- The process exit code follows the first failed stage.
- `VERIFY_DEBUG=1` prints the resolved embedded configuration paths.

## Token-efficient output

When verification output is consumed by an AI agent, run it through [RTK](https://github.com/rtk-ai/rtk) to reduce token usage:

```bash
rtk bun run verify
```

## Verification stack

The fixed stages run in this order:

1. `lint-directives` rejects `eslint-disable`, `eslint-enable`, `oxlint-disable`, and `oxlint-enable` directives.
2. `oxlint` runs type-aware linting and type checking with warnings denied.
3. `fallow` checks dead code, dependencies, cycles, duplication, complexity, suppressions, and React structure.

The embedded policies use the current quality stack:

- Oxlint 1.75.0 with `oxlint-tsgolint` 7.0.2001;
- official ESLint rules through `oxlint-plugin-eslint`;
- local quality and UI boundary plugins;
- Fallow 3.9.1;
- no Next.js plugin, route, server-action, or App Router checks.

Local Oxlint, Fallow, and `verify.config.*` files do not replace the embedded locked configuration.

## Development

```bash
bun install --frozen-lockfile
bun run --silent verify
bun test
bun run build:release
```

`bun run verify` builds the release package and runs its packaged launcher against this repository.

## Release

The release tag must match `vX.Y.Z` and `package.json.version`.

```bash
bun install --frozen-lockfile
bun run --silent verify
bun test
bun run check:release-tag -- vX.Y.Z
bun run build:release
```

GitHub Actions builds one package tarball and attaches it to the corresponding GitHub Release.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
