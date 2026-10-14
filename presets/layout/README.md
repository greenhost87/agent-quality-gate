# Preset: `layout`

Single entry for repository layout policy: where modules live, where tests live, and which packages may import which. TypeScript and JavaScript layout checks use Oxlint and Fallow file discovery.

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
    entries:
      - app/routes.ts
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
          compositionDirectories: [app, components, system]
          nonProductionDirectories: [deploy, migrations, scripts, tests]
          alwaysAllowedDependencies: [system]
          testDirectories: [tests]
          testImportablePrivatePackages: [app]
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
            - app
            - visual
```

The example uses the supported preset-name list plus `presetConfig` syntax. The same sections can be placed directly under `presets.layout` using inline preset options. Replace `entries` with the project's real TypeScript or JavaScript runtime roots. Use the canonical `layout` preset name and its nested sections; the former `module-placement`, `test-colocation`, and `packages` preset aliases and flat layout options are no longer supported.

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

| Policy           | Layout                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `application`    | All `*.test.ts` / `*.spec.ts` / `*.bench.ts` under `tests/`; helpers only under `tests/support/` or `tests/setup/`         |
| `aqg-repository` | Owner tests under `system/tests/*`, `presets/*/tests`, `adapters/*/tests`, …; shared helpers under `system/tests/support/` |

### `packages`

Configure directory classifications explicitly. A top-level directory is treated as a package unless it appears in `compositionDirectories` or `nonProductionDirectories`. No directory names, allowed root filenames, or globally allowed dependencies are assumed.

| Field                           | Purpose                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `allowedRootModules`            | Filenames allowed at the project root                                                                                                 |
| `alwaysAllowedDependencies`     | Package names any package may import via `@/…` without a declared edge                                                                |
| `compositionDirectories`        | Top-level composition/infrastructure directory names excluded from the package graph                                                  |
| `declaredDependencies`          | Map of package → other packages it may import via `@/…`; imports within the same package are allowed                                  |
| `nonProductionDirectories`      | Top-level non-production directory names excluded from the package graph                                                              |
| `privatePackages`               | Top-level directories that only code under the same root may import, subject to the configured test exception                         |
| `testDirectories`               | Project-relative test directories whose imports receive the test exception; modules outside these directories cannot import from them |
| `testImportablePrivatePackages` | Private package names code under `testDirectories` may import                                                                         |

All lists default to `[]`; `declaredDependencies` defaults to `{}`. Package-boundary checking is inactive until at least one setting is non-empty. Once active, root source files require an explicit `allowedRootModules` entry. Composition/non-production classifications do not exempt modules from private-package or test-import restrictions.

For example, to let root `tests/` import a private `app/`, set `privatePackages: [app]`, `testDirectories: [tests]`, and `testImportablePrivatePackages: [app]`. There is no implicit exception for `app` or `tests`. Only the configured test-directory prefixes receive this exception; `app/tests/` does not match `tests`. Code outside the configured test directories cannot import or re-export their modules.

To retain the former directory classifications, explicitly configure `compositionDirectories: [app, components, system]` and `nonProductionDirectories: [deploy, migrations, scripts, tests]`. Add `alwaysAllowedDependencies: [system]` if it should be globally permitted and list any allowed root filenames in `allowedRootModules`.
