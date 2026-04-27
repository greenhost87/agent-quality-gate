# agent-quality-gate

`agent-quality-gate` is a Bun-first CLI quality gate for AI-assisted TypeScript workflows.

## Status

- This repository is not published to a package registry.
- Official install channels are Git tags and GitHub Release package tarballs.
- External pull requests are currently not accepted.
- Bug reports, documentation problems, and feature ideas should go through issues.

## Install

- Bun `>=1.3`.

Install the platform-specific package tarball from a GitHub Release:

```bash
bun add -d \
  https://github.com/greenhost87/agent-quality-gate/releases/download/v0.2.1/agent-quality-gate-0.2.1-darwin-arm64.tgz
```

The package contains the standalone `verify` binary and no runtime dependencies. Target projects get one lockfile entry, not the quality-gate toolchain dependency graph.

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

For local development or release validation, build and install the local package artifact:

```bash
bun run build:release
bun add -d ./artifacts/agent-quality-gate-0.2.1-darwin-arm64.tgz
```

```bash
bun run verify
```

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

- `protected-coverage`: internal preflight step that ensures protected paths are still covered before the external tools run.
- `eslint`: uses `eslint`, `@eslint/js`, `typescript-eslint`, and `eslint-plugin-check-file` to validate JavaScript and TypeScript code style, correctness, and file naming rules.
- `eslint-length`: uses a separate late ESLint pass for `max-len` and `max-lines`, after semantic and structure checks.
- `markdown-headings`: uses the bundled Bun checker to reject duplicate Markdown headings.
- `tsc`: uses `typescript` to run type-checking with the bundled `tsconfig.verify.json`, including unused locals and unused parameters checks.
- `duplicate-shapes`: uses the internal TypeScript analyzer to detect duplicate exported TypeScript shapes in `src/`.
- `depcruise`: uses `dependency-cruiser` to validate module dependency structure in `src/`.
- `knip`: uses `knip` to find unused exports.
- `jscpd`: uses `jscpd` to detect copy-pasted code in the allowed source directories.

## Release

Release tag must match `vX.Y.Z` and `package.json.version`.

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
