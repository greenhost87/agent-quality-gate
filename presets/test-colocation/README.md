# Preset: `test-colocation`

Keeps test, spec, and bench files out of production trees. Uses `fallow list --files` during the verify boundaries phase — no oxlint rules, no preflight.

## What it installs

| Kind          | Detail                    |
| ------------- | ------------------------- |
| Managed files | none                      |
| Dependencies  | none                      |
| Check module  | `check.ts` boundary check |

Requires: none.

## Gate config (not in the target project)

```yaml
projects:
  - root: /absolute/path/to/app
    presets:
      - test-colocation
    presetConfig:
      test-colocation:
        policy: application
```

| Policy           | Layout                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `application`    | All `*.test.ts` / `*.spec.ts` / `*.bench.ts` under `tests/`; helpers only under `tests/support/` or `tests/setup/`       |
| `aqg-repository` | Owner tests under `gate/tests`, `presets/*/tests`, `adapters/*/tests`, …; top-level `tests/` limited to `tests/support/` |

## Enable

```yaml
presets:
  - test-colocation
presetConfig:
  test-colocation:
    policy: application
```
