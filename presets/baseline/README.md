# Preset: `baseline`

`aqg/no-production-test-substitution` forbids Bun module replacements of project modules, spies on imported project implementations, and direct mutation of imported implementation surfaces in tests and test helpers. Import aliases and local aliases are resolved through lexical bindings. Builtins and resolved external packages remain valid boundaries; unresolved module replacement targets are rejected. Handwritten ports are not a substitute for exercising the production implementation under test.

Always-on AQG house style. Verify always activates this preset; it cannot be disabled. Optional presets in project config are additive on top of baseline.

The Oxlint plugin id stays `aqg` (rule names `aqg/…`) so diagnostics stay stable. The preset name is `baseline`.

## What it installs

| Kind          | Detail                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| Oxlint plugin | `aqg` ← `oxlint/index.ts` (bundled to `oxlint/index.js` in the release)                   |
| Oxlint rules  | Console format placeholders, test hygiene, JSON deep-copy ban, and TypeScript house rules |

Requires: none. Managed files: none. Dependencies: none.

`aqg/no-json-parse-json-stringify` rejects `JSON.parse(JSON.stringify(...))`, including computed-member forms such as `JSON["parse"](...)`. Use `structuredClone(value)` instead. Split locals remain an intentional non-detection.

Core Oxlint `no-useless-catch` stays enabled in the packaged assets config for every project, including isolated preset-package verify.

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
|                                        |
