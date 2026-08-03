# agent-quality-gate

`agent-quality-gate` is a locked Oxlint and Fallow quality gate for AI-assisted TypeScript and JavaScript projects.

## Requirements

- macOS or Linux on ARM64 or x64. Windows is not supported.
- Node.js 22.12.0 or newer.
- Bun 1.3.14 or newer for the commands below.

## Install

Download the package archive from the [latest GitHub Release](https://github.com/greenhost87/agent-quality-gate/releases/latest), then install it:

```bash
bun add -d ./agent-quality-gate-*.tgz
```

Add the package binary to a script:

```json
{
  "scripts": {
    "verify": "verify"
  }
}
```

## Configure

Create `agent-quality-gate.config.json` in the project root. The file is required.

```json
{
  "entries": ["src/index.ts", "bin/*.ts"],
  "fallowIgnorePatterns": ["migrations/**"],
  "health": {
    "maxCyclomatic": 10,
    "maxCognitive": 15,
    "maxCrap": 999
  }
}
```

- `entries` is a required non-empty list of project-relative Fallow entry globs.
- `fallowIgnorePatterns` is an optional list of project-relative globs that Fallow must not analyze. These files remain covered by Oxlint.
- `health` optionally overrides Fallow's per-function complexity thresholds. `maxCyclomatic` and `maxCognitive` must be integers from 0 through 65535. `maxCrap` must be a non-negative number. Omitted values retain the locked defaults of 20, 15, and 999 respectively.

To add project-specific Oxlint JS rules:

```json
{
  "entries": ["src/index.ts"],
  "plugins": [
    {
      "name": "project",
      "specifier": "./tools/oxlint-project-plugin.mjs",
      "rules": {
        "project/no-custom-pattern": "error"
      }
    }
  ]
}
```

Plugin specifiers are resolved from the project root and may reference local files or installed packages. Local plugin files are added to the Fallow entries automatically. Every configured rule must use the declared plugin name as its prefix. Project plugins cannot replace or disable locked rules.

To enable native Oxlint plugins, omit `specifier`:

```json
{
  "entries": ["src/index.ts"],
  "plugins": [
    {
      "name": "react",
      "rules": {
        "react/rules-of-hooks": "error"
      }
    }
  ]
}
```

## Usage

```bash
bun run verify
```

For token-efficient agent output, use [RTK](https://github.com/rtk-ai/rtk):

```bash
rtk bun run verify
```

## Checks

Checks run in order and stop at the first failure:

1. Reject `oxlint-disable` directives and prevent ESLint disable directives from suppressing locked rules.
2. `oxlint` runs type-aware linting and type checking with warnings denied.
3. `fallow` checks unused code and dependencies, cycles, duplication, complexity, and suppressions.

Local Oxlint and Fallow configuration files do not replace the embedded locked policy.

## Development

```bash
bun install --frozen-lockfile
bun run --silent verify
bun run test
```

## License

MIT. See [LICENSE](LICENSE).
