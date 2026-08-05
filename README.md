# agent-quality-gate

`agent-quality-gate` is a locked Oxlint and Fallow quality gate for AI-assisted TypeScript and JavaScript projects.

## Requirements

- macOS or Linux on ARM64 or x64. Windows is not supported.
- Node.js 24.19.0 or newer and Bun 1.3.14 or newer.

## Setup

Download the package archive from the [latest release](https://github.com/greenhost87/agent-quality-gate/releases/latest) and install it:

```bash
bun add -d ./agent-quality-gate-*.tgz
```

Add the commands to `package.json`:

```json
{
  "scripts": {
    "verify": "verify",
    "generate-agent-guide": "generate-agent-guide"
  }
}
```

Create the required `agent-quality-gate.config.json` in the project root:

```json
{
  "entries": ["src/index.ts"]
}
```

## Commands

```bash
bun run verify
bun run generate-agent-guide
```

- `verify` runs the locked quality gate and stops at the first failed stage.
- `generate-agent-guide` writes a compact `agent-quality-gate.md` from the effective project policy.

For token-efficient verification output, use [RTK](https://github.com/rtk-ai/rtk):

```bash
rtk bun run verify
```

Reference the generated guide from the root `AGENTS.md`:

```md
Before changing JavaScript or TypeScript, read `agent-quality-gate.md` and run `bun run --silent verify` after the change.
```

## Configuration

```json
{
  "entries": ["src/index.ts", "bin/*.ts"],
  "fallowIgnorePatterns": ["migrations/**"],
  "health": {
    "maxCyclomatic": 10,
    "maxCognitive": 15,
    "maxCrap": 999
  },
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

- `entries` is a required non-empty list of project-relative Fallow entry globs.
- `fallowIgnorePatterns` optionally excludes project-relative globs from Fallow only. Oxlint still checks them.
- `health` overrides per-function complexity limits. `maxCyclomatic` and `maxCognitive` accept integers from 0 through 65535. `maxCrap` accepts any non-negative number. Defaults are 20, 15, and 999.
- `plugins` enables project-specific Oxlint rules. Omit `specifier` for native Oxlint plugins or set it to a local file or installed package for a JavaScript plugin. Rule names must start with the declared plugin name. Local plugin files become Fallow entries automatically. Plugins cannot replace or disable locked rules.

## Validation

Checks run in order and stop at the first failure:

1. Reject `oxlint-disable` directives and prevent ESLint directives from suppressing locked rules.
2. Run type-aware Oxlint and TypeScript type checking with warnings denied.
3. Run Fallow checks for unused code and dependencies, cycles, duplication, complexity, and suppressions.

Local Oxlint and Fallow configuration files do not replace the embedded locked policy.

## Development

```bash
bun install --frozen-lockfile
bun run --silent verify
bun run test
```

## License

MIT. See [LICENSE](LICENSE).
