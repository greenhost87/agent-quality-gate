# Preset: `baseline`

Always-on AQG house style. Verify always activates this preset; it cannot be disabled. Optional presets in project config are additive on top of baseline.

The Oxlint plugin id stays `aqg` (rule names `aqg/…`) so diagnostics stay stable. The preset name is `baseline`.

## What it installs

| Kind          | Detail                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Oxlint plugin | `aqg` ← `oxlint/index.ts` (bundled to `oxlint/index.js` in the release) |
| Oxlint rules  | Console format placeholders, test hygiene, and TypeScript house rules   |

Requires: none. Managed files: none. Dependencies: none.

## Enable

Nothing to enable. Listing `baseline` in `presets` is allowed and redundant:

```yaml
presets:
  - baseline
```

Omitting `presets` or using `presets: []` still runs baseline.
