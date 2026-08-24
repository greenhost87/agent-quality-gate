# Preset: `module-placement`

Keeps production modules one concern level deep under configured directories. No payload files or npm deps — oxlint only.

When the preset is enabled but a project has no `modulePlacement` block (or an empty `directories` list), the rule is a no-op.

## What it installs

| Kind          | Detail                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Managed files | none                                                                                                     |
| Dependencies  | none                                                                                                     |
| Oxlint rule   | `module-placement/module-placement` ← `oxlint/module-placement.ts` (bundled to `.js` on package/install) |

Requires: none.

## Gate config (not in the target project)

Watched directories are configured only in agent-quality-gate's `config.yaml` / `assets/global-config.yaml`, under the project entry.

```yaml
projects:
  - root: /absolute/path/to/app
    presets:
      - module-placement
    modulePlacement:
      directories:
        - system/agents
      rootExceptions:
        system/agents:
          - agents.types.ts
```

| Field            | Purpose                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| `directories`    | Project-relative directories whose direct `.ts` / `.tsx` children must not stay flat |
| `rootExceptions` | Optional map of directory → filenames allowed directly under that directory          |

Valid layout under each watched directory:

```text
<directory>/<concern>/<file>.ts
<directory>/<concern>/tests/<file>.ts
```

`<concern>` must match `[a-z][a-z0-9-]*`. An optional `tests/` segment is allowed for colocated tests. Other paths deeper than one concern segment are rejected.

## Enable

```yaml
presets:
  - module-placement
```

Add `modulePlacement.directories` in the same project entry when you want enforcement.
