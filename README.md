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

Install from a Git tag:

```bash
bun add -d git+https://github.com/greenhost87/agent-quality-gate.git#v0.0.1
```

Install from a GitHub Release tarball:

```bash
bun add -d https://github.com/greenhost87/agent-quality-gate/releases/download/v0.0.1/agent-quality-gate-0.0.1.tgz
```

Add a script:

```json
{
  "scripts": {
    "verify": "verify"
  }
}
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

- `verify` runs fixed steps in this order: `protected-coverage`, `eslint`,
  `ast-grep`, `remark`, `tsc`, `duplicate-shapes`, `depcruise`, `knip`,
  `jscpd`.
- Locked mode rejects local `verify.config.*` files and local `--config` paths.
- Bundled configs from `dist/default-configs` are used.

## Verification Stack

- `protected-coverage`: internal preflight step that ensures protected paths are still covered before the external tools run.
- `eslint`: uses `eslint`, `@eslint/js`, `typescript-eslint`, and
  `eslint-plugin-check-file` to validate JavaScript and TypeScript code style,
  correctness, and file naming rules.
- `ast-grep`: uses `@ast-grep/cli` with the bundled `sgconfig.yml` rules to catch forbidden code patterns by syntax tree matching.
- `remark`: uses `remark-cli`, `remark-lint`,
  `remark-preset-lint-recommended`, `remark-lint-maximum-line-length`, and
  `remark-lint-no-duplicate-headings` to lint Markdown files.
- `tsc`: uses `typescript` to run type-checking with the bundled
  `tsconfig.verify.json`, including unused locals and unused parameters checks.
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
bun run pack:verify
```

1. Push tag `vX.Y.Z`.
2. `release.yml` validates tag/version parity, runs checks, and builds the tarball.
3. GitHub Release attaches `artifacts/*.tgz`.
4. Registry publication remains disabled.

Run install checks explicitly when validating release installs:

```bash
bun run test:e2e:install
```

## License

MIT. See [LICENSE](LICENSE).
