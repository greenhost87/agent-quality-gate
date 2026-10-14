# Configuration

`system/configs/global-config.yaml` in a source checkout, or `dist/configs/global-config.yaml` in an extracted release, is the template for `~/.agent-quality-gate/config.yaml` (or `$AGENT_QUALITY_GATE_HOME/config.yaml`). Supported project fields:

```yaml
projectDefaults:
  ignorePatterns:
    - generated/**
  presets:
    baseline:
      maxInlineParameterObjectMembers: 3

projects:
  - root: /absolute/path/to/app
    entries:
      - src/index.ts
      - bin/*.ts
    ignorePatterns:
      - migrations/**
    autoFix:
      oxlint: true
      fallow: false
    presets:
      bun-parse: {}
      config: {}
      database: {}
      # database-sqlite: {} # use instead of database for bun:sqlite projects
      playwright: {}
      baseline:
        literalDynamicImportFiles: [instrumentation.ts, src/instrumentation.ts]
        maxInlineParameterObjectMembers: 3
        noClassSuffixes: [Error, Element]
      layout:
        placement:
          directories:
            - system/agents
          rootExceptions:
            system/agents:
              - agents.types.ts
        testColocation:
          policy: aqg-repository

  - root: /absolute/path/to/app/packages/nested
    entries:
      - src/main.ts
```

- `projectDefaults` is an optional shared project configuration. Nested objects are merged recursively, while project-level scalars and lists replace defaults. A `root` in this section is ignored; each `projects` item must declare its own root.
- `projects` is the allowlist. Each item receives `projectDefaults` before validation and normalization.
- AQG verifies TypeScript and JavaScript projects.
- `root` is an absolute filesystem path. Nested roots win over shallower ancestors for the same `cwd`. A git worktree of a configured root uses that project's presets and other fields; verify runs against the worktree.
- `entries` are project-relative globs. Exports from these Fallow entries are treated as used.
- `ignorePatterns` is an optional list of project-relative globs merged into the packaged Fallow/Oxlint ignore list.
- `autoFix.oxlint` and `autoFix.fallow` independently opt into source edits during verification (both default to `false`). Oxlint uses `--fix`, not dangerous fixes or suggestions; Fallow uses `fix --yes --no-create-config` with a disposable AQG config. Fixes run sequentially before read-only analysis; Fallow may remove unused exports, dependencies, or enum members. Enabling either option allows verify and stop hooks to edit project files. Set these boolean values per project or under `projectDefaults`; invalid `autoFix` settings skip that project.
- `intrinsicInteractions`, `lifecycleCallbacks`, and `actionCompatibility` configure Fallow's runtime UI interaction vocabulary. AQG copies these values into its generated Fallow config; Fallow validates callback names, interaction families, classifications, duplicate entries, and compatibility methods.
- `presets` is an optional map of shipped names from `presets/*/manifest.json` and home-installed names from `$AGENT_QUALITY_GATE_HOME/presets/<name>/` (install with `bun ./system/install/cli.ts preset <absolute-source-root>` or `aqg-presets` `bun run install`). Each key activates the preset; its object contains that preset's options. Use `{}` when no options are needed. Resolution order: shipped, then home install. Presets run as part of the TypeScript verification pipeline. The `baseline` preset is always active; its map entry only configures it. Required optional presets are activated transitively. Unknown names are ignored. Details live in each shipped preset's README under `presets/<name>/`.
- Legacy `presets: [name]` plus a separate `presetConfig` bag remains supported. When both forms provide the same preset options, the inline `presets.<name>` object wins.
  - `presets.baseline.literalDynamicImportFiles` lists exact project-relative runtime-boundary files where `aqg/no-dynamic-import` permits relative string-literal imports such as `import('./node-runtime')`. Dynamic imports remain forbidden elsewhere; computed and package-specifier imports remain forbidden in listed files.
  - `presets.baseline.maxInlineParameterObjectMembers` caps members on inline object types in parameters (`aqg/max-inline-parameter-object-members`). Omit or use `-1` to leave the rule inactive; a non-negative integer enables the cap.
  - `presets.baseline.noClassSuffixes` enables `aqg/no-class`. Omit to leave it inactive; `[]` bans every runtime class, `["Error", "Element"]` allows those suffixes.
  - `presets.baseline.noNullishExceptUndefined: true` enables `aqg/no-nullish-except-undefined`; only `T | undefined` is allowed as absence (standalone `void` function returns remain allowed).
  - `presets.baseline.noMixedNullishTypes` controls `aqg/no-mixed-nullish-types`, which is enabled by default; set `false` to disable it.
  - `presets.bun-parse.scriptDirectories` lists CLI-only directories that production modules cannot import from. It defaults to `[]`; set `[scripts]` to check the root `scripts/` directory.
  - `presets.bun-parse.typeofObjectMode` tunes `bun-parse/no-typeof-object`: `strict` (default; ban typeof-object and `Array.isArray`), `typeof-only` (typeof-object only), or `off`.
  - `presets.config.environmentPath` relocates the managed environment helper and the matching `process.env` boundary exemption from `system/config/environment.ts` to another project-relative `.ts` path.
  - `presets.database.infrastructureImports` lists exact module specifiers rejected in test/E2E files outside managed database setup. It defaults to `[]`; the former `pg`, `@testcontainers/postgresql`, `testcontainers`, and `node-pg-migrate` list must be configured explicitly when those boundaries are required. Migration imports and database lifecycle restrictions remain checked independently.
  - `presets.database-sqlite.databaseDirectory` relocates the managed SQLite database directory from `system/database`.
  - `presets.playwright.e2eDirectory` sets the directory scoped by E2E rules (empty by default, so E2E-directory checks are inactive until configured); `externalMockOrigins` allows specific external interception origins (default `[]`), and `processRunnerImports` lists additional process-runner imports disallowed in E2E tests.
  - `presets.layout.packages` configures `allowedRootModules`, `alwaysAllowedDependencies`, `compositionDirectories`, `declaredDependencies`, `nonProductionDirectories`, `privatePackages`, `testDirectories`, and `testImportablePrivatePackages`. Lists default to `[]` and declared dependencies to `{}`; directory classifications and test exceptions must be supplied explicitly. See the layout preset README for examples.

Unknown project keys are ignored. Malformed project option shapes, such as a non-object `presetConfig` or invalid `autoFix` booleans, skip that project; malformed YAML yields an empty allowlist. Preset-specific invalid option values are handled by each preset parser.

Managed-path relocation changes destinations and rule options without rewriting payload imports. If other managed files still import canonical `@/system/config/environment` or `@/system/database/*` specifiers, configure those aliases to resolve to the relocated files.

## Shipped presets

| Preset                 | `presets.<name>` options                                                                                                             | Core contract                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `baseline` (always on) | `literalDynamicImportFiles`, `maxInlineParameterObjectMembers`, `noClassSuffixes`, `noNullishExceptUndefined`, `noMixedNullishTypes` | TypeScript house rules (type-only files, aliases, unions, …)                                |
| `bun-parse`            | `scriptDirectories`, `typeofObjectMode`                                                                                              | Ban recursive handmade JSON ADTs / plain-object typeof guards; prefer Bun + valibot         |
| `config`               | `environmentPath`                                                                                                                    | Env access only via the managed environment helper (default `system/config/environment.ts`) |
| `database`             | `infrastructureImports`                                                                                                              | `system/database/`, `tests/setup/testDatabase*.ts`, `migrations/`, DAO layout               |
| `database-sqlite`      | `databaseDirectory`                                                                                                                  | Managed `bun:sqlite` connection, migrations, isolated tests, DAO/test boundaries            |
| `playwright`           | `e2eDirectory`, `externalMockOrigins`, `processRunnerImports`                                                                        | Configured E2E directory and DAO / `system/database` import boundaries                      |
| `layout`               | `placement`, `testColocation`, `packages`                                                                                            | Repository layout, test colocation, package graph                                           |
| `n8n-lints`            | none                                                                                                                                 | Portable n8n-style lints (skipped tests, catch hygiene, string discipline)                  |

Other presets can be installed from an optional preset repository under `$AGENT_QUALITY_GATE_HOME/presets/<name>/`. Only the names in the shipped catalog above are bundled with AQG; a directory under `presets/` alone does not make a preset shipped. Managed destinations are fixed by their manifests except for the documented `config.environmentPath` and `database-sqlite.databaseDirectory` relocations.
