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

`aqg/no-dynamic-import` forbids `import()` by default. Configure exact project-relative runtime-boundary files through `presetConfig.baseline.literalDynamicImportFiles`; those files may use relative string-literal imports such as `import('./node-runtime')`. Computed and package-specifier imports remain forbidden.

## Hints on verify failure

When baseline flags micro-split smells, verify also emits `hint:avoid-micro-splits — .aqg/hints/avoid-micro-splits.md` and writes that file under `.aqg/hints/`.

| Rule                                   | Typical micro-split smell                     |
| -------------------------------------- | --------------------------------------------- |
| `aqg/no-thin-forwarders`               | one-line wrapper re-exporting a call          |
| `aqg/no-trivial-const-wrappers`        | zero-arg function returning a constant        |
| `aqg/no-identity-aliases`              | `const x = y` alias instead of using `y`      |
| `aqg/no-useless-exported-type-aliases` | exported type that only renames another       |
| `aqg/no-runtime-in-types-files`        | runtime value leaked into a `*.types.ts` file |

With the optional `single-consumer` preset, `single-consumer:` findings emit the same hint plus `hint:single-consumer`.
