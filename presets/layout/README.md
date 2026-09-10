# Preset: `layout`

Single entry for repository layout policy: where modules live, where tests live, and which packages may import which. Engines stay as they were (oxlint + fallow list checks); the config surface and docs are unified.

Semantic API boundaries (`database/*`, `config/environment-boundaries`, `bun-parse/scripts-boundaries`, …) are **not** part of this preset.

## Rule map

| Concern                                            | Config path                          | Engine                     | Rule / check id                                      |
| -------------------------------------------------- | ------------------------------------ | -------------------------- | ---------------------------------------------------- |
| Concern depth, forbidConcernPrefix, rootExceptions | `presetConfig.layout.placement`      | oxlint                     | `module-placement/module-placement`                  |
| maxFilesPerDirectory, routeCompositionRoots        | `presetConfig.layout.placement`      | fallow list via `check.ts` | stderr prefix `layout/placement:`                    |
| Test / spec / bench placement                      | `presetConfig.layout.testColocation` | fallow list via `check.ts` | stderr prefix `layout/test-colocation:`              |
| Package import graph + root modules                | `presetConfig.layout.packages`       | oxlint                     | `packages/package-boundaries` (off until configured) |

Sections are independent. Enable `layout` and configure only the sections you need.

## What it installs

| Kind            | Detail                                                             |
| --------------- | ------------------------------------------------------------------ |
| Managed files   | none                                                               |
| Dependencies    | none                                                               |
| Oxlint rules    | `module-placement/module-placement`, `packages/package-boundaries` |
| Boundary checks | directory capacity, route composition, test colocation             |

Requires: none.

## Gate config

```yaml
projects:
  - root: /absolute/path/to/app
    presets:
      - layout
    presetConfig:
      layout:
        placement:
          directories:
            - app/app
            - app/components/ui
          forbidConcernPrefix:
            - app/app
            - app/components/ui
          maxDepth:
            app/app: 2
            app/components/ui: 2
          maxFilesPerDirectory:
            app/components/ui: 12
          routeCompositionRoots:
            app/app:
              manifest: app/routes.ts
              presentationRoot: app/components/ui
        testColocation:
          policy: application
        packages:
          allowedRootModules:
            - config.ts
            - instrumentation.ts
            - next.config.ts
            - utils.ts
            - validation.ts
          declaredDependencies:
            orders: [shopify]
            http: [auth]
            fabrics: [media]
          privatePackages:
            - visual
```

### `placement`

| Field                   | Purpose                                                                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `directories`           | Project-relative roots whose production modules must live below at least one concern directory                                                                                                                                                                                    |
| `rootExceptions`        | Optional map of directory → filenames allowed directly under that directory                                                                                                                                                                                                       |
| `forbidConcernPrefix`   | Watched roots where basenames must not start with any ancestor concern name, except an exact mirrored name                                                                                                                                                                        |
| `maxDepth`              | Optional map of watched root → maximum concern directory depth; default `1`. Depth 2 already allows mixed flat files and nested concern folders under the same watched root (for example `app/components/features/fabrics/decimal-field.tsx` beside `.../fabrics/card/card.tsx`). |
| `maxFilesPerDirectory`  | Optional map of watched root → maximum direct `.ts` / `.tsx` files in every directory at or below that root                                                                                                                                                                       |
| `routeCompositionRoots` | Optional route-only roots, their route manifest, and destination for presentation modules                                                                                                                                                                                         |

Valid layout under each watched directory:

```text
<directory>/<concern>/.../<file>.ts
<directory>/<concern>/.../tests/<file>.ts
<directory>/tests/**/<file>.ts
```

### `testColocation`

| Policy           | Layout                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `application`    | All `*.test.ts` / `*.spec.ts` / `*.bench.ts` under `tests/`; helpers only under `tests/support/` or `tests/setup/`       |
| `aqg-repository` | Owner tests under `gate/tests`, `presets/*/tests`, `adapters/*/tests`, …; top-level `tests/` limited to `tests/support/` |

### `packages`

Composition / infrastructure roots are not packages: `app/`, `components/`, `system/`, plus non-production `deploy/`, `migrations/`, `scripts/`, `tests/`. Everything else at the project root is a package.

| Field                  | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `allowedRootModules`   | Filenames allowed at the project root                               |
| `declaredDependencies` | Map of package → packages it may import via `@/…`                   |
| `privatePackages`      | Top-level directories that only code under the same root may import |

When `app` is listed in `privatePackages`, files under the project-root `tests/` tree may import it (`@/app/...` or relative paths). That exception does not apply to other private roots, nested trees such as `app/tests/`, or production-like paths whose names merely look like tests. Production modules (including code under `app/`) must not import or re-export modules from root `tests/`, so a test helper cannot become a privacy bypass.

## Legacy aliases

These preset names still resolve to `layout`:

- `module-placement`
- `test-colocation`
- `packages`

Legacy `presetConfig` keys still merge into the matching section:

- `presetConfig.module-placement` → `layout.placement`
- `presetConfig.test-colocation` → `layout.testColocation`
- `presetConfig.packages` → `layout.packages`

Prefer `presets: [layout]` and `presetConfig.layout.*` for new config.
