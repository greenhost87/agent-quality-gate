# Preset: `module-placement`

Keeps production modules within a configured concern depth and prevents oversized source directories. No payload files or npm dependencies.

When the preset is enabled but a project has no `modulePlacement` block (or an empty `directories` list), the rule is a no-op.

## What it installs

| Kind           | Detail                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Managed files  | none                                                                                                     |
| Dependencies   | none                                                                                                     |
| Oxlint rule    | `module-placement/module-placement` ← `oxlint/module-placement.ts` (bundled to `.js` on package/install) |
| Boundary check | Counts TypeScript modules directly inside each directory under configured roots                          |

Requires: none.

## Gate config (not in the target project)

Watched directories are configured only in agent-quality-gate's `config.yaml` / `assets/global-config.yaml`, under the project entry.

```yaml
projects:
  - root: /absolute/path/to/app
    presets:
      - module-placement
    presetConfig:
      module-placement:
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
```

| Field                   | Purpose                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `directories`           | Project-relative roots whose production modules must live below at least one concern directory              |
| `rootExceptions`        | Optional map of directory → filenames allowed directly under that directory                                 |
| `forbidConcernPrefix`   | Watched roots where basenames must not start with any ancestor concern name, except an exact mirrored name  |
| `maxDepth`              | Optional map of watched root → maximum concern directory depth; default `1`                                 |
| `maxFilesPerDirectory`  | Optional map of watched root → maximum direct `.ts` / `.tsx` files in every directory at or below that root |
| `routeCompositionRoots` | Optional route-only roots, their route manifest, and destination for presentation modules                   |

Valid layout under each watched directory:

```text
<directory>/<concern>/.../<file>.ts
<directory>/<concern>/.../tests/<file>.ts
<directory>/tests/**/<file>.ts
```

Each `<concern>` must match `[a-z][a-z0-9-]*`. Production depth defaults to one concern segment and can be raised per root with `maxDepth`. An optional final `tests/` directory is allowed for colocated tests. A top-level `tests/` tree under the watched root is exempt at any depth.

When `forbidConcernPrefix` includes a watched root, basenames must not repeat any ancestor concern context: use `workflow/edit/canvas-chrome.tsx`, not `workflow/edit/editor-canvas-chrome.tsx`. Exact mirrored component names remain valid, including `button/button.tsx` and `workflow/canvas-chrome/canvas-chrome.tsx`.

`maxFilesPerDirectory` applies recursively. A limit on `app/components/ui` also checks `app/components/ui/workflow/edit`. When a directory exceeds the limit, split it into concern directories without exceeding `maxDepth`.

`routeCompositionRoots` keeps route trees composition-only. TypeScript modules under a configured root must be referenced by its route manifest. Unreferenced views and UI components fail with an explicit instruction to move them under `presentationRoot`. Set `maxDepth` to `2` when mirrored route layouts such as `app/app/workflow/list/list.tsx` are allowed.

## Enable

```yaml
presets:
  - module-placement
```

Add `presetConfig.module-placement.directories` in the same project entry when you want enforcement.
