# agent-quality-gate

`agent-quality-gate` is a Bun-first CLI quality gate for AI-assisted TypeScript workflows.

## Status

- This repository is not published to a package registry.
- Official install channels are Git tags and GitHub Release tarballs.
- External pull requests are currently not accepted.
- Bug reports, documentation problems, and feature ideas should go through issues.

## Install

- Bun `>=1.3`.
- Git.

Install from a GitHub Release tarball:

```bash
bunx --package https://github.com/greenhost87/agent-quality-gate/releases/download/v0.0.1/agent-quality-gate-init-0.0.1.tgz agent-quality-gate-init
```

`agent-quality-gate-init` installs the heavy runtime into the user cache and writes a small project launcher. The runtime is not added to the consumer project dependencies, so the consumer project lockfile does not receive the quality-gate toolchain dependency graph.

The generated project shape is:

```json
{
  "scripts": {
    "verify": "bun .agent-quality-gate/agent-quality-gate.mjs verify"
  },
  "agentQualityGate": {
    "version": "0.0.1"
  }
}
```

The runtime cache lives under:

```text
~/.cache/agent-quality-gate/runtimes/v0.0.1
```

For local development or release validation, run the local init tarball and pass the local runtime tarball as the explicit runtime source:

```bash
bunx --package file:/path/to/agent-quality-gate/artifacts/agent-quality-gate-init-0.0.1.tgz agent-quality-gate-init --runtime-source file:/path/to/agent-quality-gate/artifacts/agent-quality-gate-0.0.1.tgz
```

If the runtime is already installed, `verify` uses it. If it is missing, `verify` fails and prints the init command to run; it does not install dependencies silently.

```bash
bun run verify
```

Direct runtime package installation is still supported for release smoke tests:

```bash
bun add -d git+https://github.com/greenhost87/agent-quality-gate.git#v0.0.1
bun add -d https://github.com/greenhost87/agent-quality-gate/releases/download/v0.0.1/agent-quality-gate-0.0.1.tgz
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
- Bundled configs from `dist/default-configs` are used.

## Verification Stack

- `protected-coverage`: internal preflight step that ensures protected paths are still covered before the external tools run.
- `eslint`: uses `eslint`, `@eslint/js`, `typescript-eslint`, and `eslint-plugin-check-file` to validate JavaScript and TypeScript code style, correctness, and file naming rules.
- `eslint-length`: uses a separate late ESLint pass for `max-len` and `max-lines`, after semantic and structure checks.
- `markdown-headings`: uses the bundled Bun checker to reject duplicate Markdown headings.
- `tsc`: uses `typescript` to run type-checking with the bundled `tsconfig.verify.json`, including unused locals and unused parameters checks.
- `duplicate-shapes`: uses the internal `ts-morph`-based analyzer to detect duplicate exported TypeScript shapes in `src/`.
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
bun run pack:release
```

1. Push tag `vX.Y.Z`.
2. `release.yml` validates tag/version parity, runs checks, and builds tarballs.
3. GitHub Release attaches `artifacts/*.tgz`.
4. Registry publication remains disabled.

## License

MIT. See [LICENSE](LICENSE).
