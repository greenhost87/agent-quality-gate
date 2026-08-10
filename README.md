# agent-quality-gate

`agent-quality-gate` provides a locked Oxlint and Fallow quality gate for AI-assisted TypeScript and JavaScript projects.

## Requirements

- macOS or Linux on ARM64 or x64. Windows is not supported.
- Node.js 24.19.0 or newer and Bun 1.3.14 or newer.

## Setup

Install the release archive directly from GitHub:

```bash
bun add -d https://github.com/greenhost87/agent-quality-gate/releases/download/v0.3.0/agent-quality-gate-0.3.0.tgz
```

Add the package commands to `package.json`:

```json
{
  "scripts": {
    "verify": "verify",
    "generate-agent-guide": "generate-agent-guide"
  }
}
```

Create `agent-quality-gate.config.json` in the project root with at least one project entry:

```json
{
  "entries": ["src/index.ts"]
}
```

Generate the project-specific agent guide:

```bash
bun run generate-agent-guide
```

Reference the generated `agent-quality-gate.md` from the root `AGENTS.md`:

```md
Before changing JavaScript or TypeScript, read `agent-quality-gate.md` and run `bun run --silent verify` after the change.
```

## Usage

```bash
bun run --silent verify
```

`verify` first rejects invalid configuration and forbidden lint suppression directives. It then runs type-aware Oxlint with TypeScript type checking and Fallow checks for unused code and dependencies, cycles, duplication, complexity, and suppressions.

Oxlint and Fallow run concurrently. If either fails, findings are printed in a stable order with Oxlint first and Fallow second. A successful run prints `verify: ok`.

The embedded policy cannot be replaced or disabled by local Oxlint or Fallow configuration files.

## Configuration

All supported options are shown below:

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
- `fallowIgnorePatterns` excludes project-relative globs from Fallow only. Oxlint still checks them.
- `health` overrides per-function complexity limits. `maxCyclomatic` and `maxCognitive` accept integers from 0 through 65535, and `maxCrap` accepts any non-negative number. Defaults are 20, 15, and 999.
- `plugins` adds project-specific Oxlint rules. Omit `specifier` for a native Oxlint plugin, or set it to a local file or installed package for a JavaScript plugin. Rule names must start with the declared plugin name. Local plugin files become Fallow entries automatically. Plugins cannot replace or disable locked rules.

## Development

```bash
bun install --frozen-lockfile
bun run --silent verify
bun run test
```

## License

MIT. See [LICENSE](LICENSE).
