# Preset: `bun-parse`

Structured file/data parsing goes through Bun into a valibot schema. Types come from `v.InferOutput`. No recursive handmade JSON ADTs, plain-object typeof guards, or (by default) `Array.isArray` shape narrowing.

## What it installs

| Kind         | Detail                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed file | none                                                                                                                                                                                      |
| Dependency   | `valibot`                                                                                                                                                                                 |
| Oxlint rules | `bun-parse/no-handmade-json-types`, `bun-parse/no-raw-json-parse`, `bun-parse/no-typeof-object`, `bun-parse/scripts-boundaries` ← `oxlint/index.ts` (bundled to `.js` on package/install) |

Requires: none.

## Rules

### `no-handmade-json-types`

Rejects recursive JSON-shaped type aliases such as:

```ts
type T = string | number | boolean | null | T[] | { [k: string]: T };
```

Any names, mutual recursion, and `Record<string, T>` count.

Prefer:

```ts
const raw: unknown = await Bun.file(path).json();
const result = v.safeParse(Schema, raw);
export type Config = v.InferOutput<typeof Schema>;
```

On verify failure, the gate writes `.aqg/hints/bun-parse-json.md` and emits `hint:bun-parse-json — .aqg/hints/bun-parse-json.md`.

### `no-raw-json-parse`

Rejects `JSON.parse(...)` and non-Bun `.json()` calls outside test trees (`tests/` at any depth).

`Bun.file(...).json()`, `file(...).json()` from `bun` (including renames), a `const` bound to those factories then `.json()` (lexical scope; not `let` or aliases), and `Bun.readableStreamToJSON(...)` are allowed only when the value is passed into `v.parse` / `v.safeParse` before it escapes (no typeof / Array.isArray narrowing). Tests may use raw `JSON.parse` / `request.json()` / `response.json()`. There is no `http/` or `scripts/` exemption.

On verify failure, the gate writes `.aqg/hints/bun-parse-json.md` and emits `hint:bun-parse-json — .aqg/hints/bun-parse-json.md`.

### `no-typeof-object`

Rejects `typeof … ===/!== 'object'` and, in the default `strict` mode, `Array.isArray(...)` outside test trees. Use valibot schemas instead of handmade shape checks.

A plain-object recipe (`typeof value === 'object' && value !== null && !Array.isArray(value)`) produces one diagnostic instead of separate `typeof` and `Array.isArray` diagnostics. The checks may be reordered, regrouped, or included in a longer `&&` chain. Each recipe must use the same identifier in all three checks.

Tune via `presetConfig.bun-parse.typeofObjectMode`:

| Mode          | Behavior                                                                  |
| ------------- | ------------------------------------------------------------------------- |
| `strict`      | Ban typeof-object compares **and** `Array.isArray` (default when omitted) |
| `typeof-only` | Ban typeof-object compares only; allow standalone `Array.isArray`         |
| `off`         | Disable this rule                                                         |

Plain-object recipes produce one diagnostic in `strict` and `typeof-only`. They are allowed in test trees and when this rule is `off`.

Same `hint:bun-parse-json` as `no-raw-json-parse`.

### `scripts-boundaries`

Rejects imports and `export … from` (including dynamic `import()`) that resolve into `scripts/` from any file outside `scripts/` and test trees (`tests/` at any depth).

`scripts/` is CLI-only. Shared Bun/valibot parse helpers belong in production modules, not behind a scripts import. Tests may import scripts when exercising those entrypoints.

Same `hint:bun-parse-json` as `no-raw-json-parse`.

## Enable

```yaml
presets:
  - bun-parse
```

Optional strictness:

```yaml
presets:
  - bun-parse
presetConfig:
  bun-parse:
    typeofObjectMode: typeof-only # or strict | off
```
