# Preset: `config`

Single gateway for environment variables. Application code never reads `process.env` directly; it goes through the managed environment helper. Its default path is `system/config/environment.ts`; `presetConfig.config.environmentPath` can relocate it.

## What it installs

| Kind         | Detail                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed file | `system/config/environment.ts` ← `payload/system/config/environment.ts`                                                                                         |
| Dependency   | `valibot` 1.4.2 or newer (typed config/env schemas in project `configLoader` and elsewhere)                                                                     |
| Oxlint rules | `config/environment-boundaries`, `config/no-valibot-custom`, `config/no-trivial-valibot-schema-alias` ← `oxlint/index.ts` (bundled to `.js` on package/install) |

Requires: none.

## How access flows

```mermaid
flowchart LR
  subgraph allowed["Allowed"]
    App["App / domain code"]
    Loader["system/config/configLoader.ts<br/>(project-owned)"]
    Env["system/config/environment.ts<br/>(managed)"]
    Process["process.env"]
    App --> Loader --> Env --> Process
  end

  subgraph blocked["Blocked by oxlint"]
    Bad["Any other module"] -.->|"process.env / destructure"| Process
  end
```

Verify checks the configured environment file against the preset `contentHash` and refreshes the example under `.aqg/config/<environmentPath>`. Copy the example into place when the file is missing or drifted. Keep project-specific typed getters in your own `configLoader.ts` (or equivalent) that call the shared helpers (`getRequiredEnv`, `getBooleanEnv`, …).

## Boundary rule

Outside the configured environment helper (default `system/config/environment.ts`), these patterns fail lint:

- `process.env…`
- `const { env } = process` / assignment destructuring of `process.env`

Exception: `instrumentation.ts` may read `process.env.NEXT_RUNTIME` only (Next.js Edge/Node split). Any other env key there still fails.

## Valibot rules

With this preset, oxlint also rejects:

- `v.custom(...)` and `import { custom } from 'valibot'`
- exported trivial schema aliases such as `export const StringArraySchema = v.array(v.string())`

Prefer structural schemas (`object`, `union`, `lazy`, `pipe` + `check`) and inline trivial builders at the use site. `export const NonEmpty = v.pipe(v.string(), v.minLength(1))` is allowed. For Bun file parse + valibot (no handmade JSON ADTs), enable the `bun-parse` preset.

## Enable

The default path needs no configuration:

```yaml
presets:
  - config
```

To keep the managed helper inside an application source tree, configure a project-relative `.ts` path:

```yaml
presets:
  - config
presetConfig:
  config:
    environmentPath: src/server/config/environment.ts
```

The boundary rule and managed-file verification use the same configured path. Absolute paths, parent traversal, backslashes, and non-`.ts` destinations are ignored.

Relocation changes the managed destination and boundary exemption; it does not rewrite imports inside other managed files. Presets such as `database` and `database-sqlite` still import `@/system/config/environment`. When combining them with a relocated helper, configure that alias to resolve to the new path.
