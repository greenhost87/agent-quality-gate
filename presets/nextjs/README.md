# Preset: `nextjs`

Optional Next.js lint surface for projects that already use `react-presentation`. Enables the Oxlint `nextjs` plugin with an explicit checked rule list. Does not enable `jsx-a11y`. Enabling `react-presentation` alone does not activate this preset.

## What it installs

| Kind          | Detail                                              |
| ------------- | --------------------------------------------------- |
| Native plugin | `nextjs`                                            |
| Rules         | 21 `nextjs/*` ids from the AQG migration V4 handoff |

Requires: `react-presentation`. Managed files: none. Dependencies: none.

## Enable

```yaml
presets:
  - react-presentation
  - nextjs
```

Or just `nextjs` — `react-presentation` is pulled in via `requires`.
