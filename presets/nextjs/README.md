# Preset: `nextjs`

Optional standalone Next.js lint surface. Enables the Oxlint `nextjs` plugin with an explicit checked rule list. Does not enable `jsx-a11y`.

## What it installs

| Kind          | Detail                                              |
| ------------- | --------------------------------------------------- |
| Native plugin | `nextjs`                                            |
| Rules         | 21 `nextjs/*` ids from the AQG migration V4 handoff |

Requires: none. Managed files: none. Dependencies: none.

## Enable

This source preset is not in the shipped AQG catalog. Install it into the AQG home before enabling it:

```bash
bun ./system/install/cli.ts preset /absolute/path/to/agent-quality-gate/presets/nextjs
```

```yaml
presets:
  - nextjs
```
