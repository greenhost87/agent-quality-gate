# agent-quality-gate

`agent-quality-gate` is a Bun-built standalone quality gate for AI-assisted TypeScript workflows.

## Status

- This repository is not published to a package registry.
- Official install channels are Git tags and GitHub Release package tarballs.
- External pull requests are currently not accepted.
- Bug reports, documentation problems, and feature ideas should go through issues.

## Install

Target projects do not need Bun or the external toolchain at runtime.

Install the platform-specific package tarball from a GitHub Release:

```bash
bun add -d \
  https://github.com/greenhost87/agent-quality-gate/releases/download/v0.3.0/agent-quality-gate-0.3.0-darwin-arm64.tgz
```

GitHub Release package tarballs contain the standalone `verify` binary and no runtime dependency graph for the bundled checks. Target projects get one lockfile entry, not the quality-gate toolchain dependency graph.

Use the package bin from a script:

```json
{
  "scripts": {
    "verify": "verify"
  }
}
```

The binary lives under `node_modules`:

```text
node_modules/agent-quality-gate/dist/bin/verify
```

For local package validation, build and install the release artifact:

```bash
bun run build:release
bun add -d ./artifacts/agent-quality-gate-0.3.0-darwin-arm64.tgz
```

```bash
bun run --silent verify
```

For repository development, `bun run verify` builds the local release package and runs `.tmp/release-package/dist/bin/verify`.

## Usage

```bash
verify
verify --all-errors
verify --help
```

- Default mode stops at the first failure.
- `--all-errors` keeps running and aggregates failures.
- Exit code mirrors the failing tool exit code.
- `VERIFY_DEBUG=1` prints resolved config and step sources.

```bash
VERIFY_DEBUG=1 verify
```

## Configuration

- `verify` runs fixed steps in this order: `protected-coverage`, `eslint`, `markdown-headings`, `tsc`, `duplicate-shapes`, `depcruise`, `knip`, `jscpd`, `eslint-length`.
- Locked mode rejects local `verify.config.*` files and local `--config` paths.
- Bundled configs are embedded into the standalone `verify` binary.

## Verification Stack

- `protected-coverage`: internal preflight step that ensures protected paths are still covered before the other checks run.
- `eslint`: runs the bundled ESLint runner with embedded `eslint`, `@eslint/js`, `typescript-eslint`, and `eslint-plugin-check-file` configuration to validate JavaScript and TypeScript code style, correctness, and file naming rules.
- `markdown-headings`: runs the bundled Markdown heading checker to reject duplicate Markdown headings.
- `tsc`: runs the bundled TypeScript checker with `tsconfig.verify.json`, including unused locals and unused parameters checks.
- `duplicate-shapes`: uses the internal TypeScript analyzer to detect duplicate exported TypeScript shapes in `src/`.
- `depcruise`: runs the bundled dependency-cruiser runner to validate module dependency structure in `src/`.
- `knip`: runs the bundled Knip runner to find unused exports.
- `jscpd`: runs the bundled duplicate detector runner to detect copy-pasted code in the allowed source directories.
- `eslint-length`: runs the bundled late ESLint pass for `max-len` and `max-lines`, after semantic and structure checks.

## Development

Development, tests, and release builds use Bun:

```bash
bun install --frozen-lockfile
bun test
bun run --silent verify
bun run build:release
```

`bun run verify` is a repository script: it builds the release package and runs the compiled standalone binary from `.tmp/release-package/dist/bin/verify`.

## Release

Release tag must match `vX.Y.Z` and `package.json.version`. Releases build platform-specific package tarballs and attach them to GitHub Releases. Registry publication remains disabled.

```bash
bun install --frozen-lockfile
```

```bash
bun run --silent verify
bun test
bun run check:release-tag -- vX.Y.Z
bun run build:release
```

1. Push tag `vX.Y.Z`.
2. `release.yml` validates tag/version parity, runs checks, and builds package tarballs.
3. GitHub Release attaches `artifacts/*`.
4. Registry publication remains disabled.

## License

MIT. See [LICENSE](LICENSE).
