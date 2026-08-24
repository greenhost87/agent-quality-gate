# Preset: `bun-parse`

Structured file/data parsing goes through Bun into a valibot schema. Types come from `v.InferOutput`. No recursive handmade JSON ADTs or plain-object typeof guards for those shapes.

## What it installs

| Kind         | Detail                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- |
| Managed file | none                                                                                         |
| Dependency   | `valibot`                                                                                    |
| Oxlint rule  | `bun-parse/no-handmade-json-types` ← `oxlint/index.ts` (bundled to `.js` on package/install) |

Requires: none.

## Rule

Rejects recursive JSON-shaped type aliases such as:

```ts
type T = string | number | boolean | null | T[] | { [k: string]: T };
```

(any names; mutual recursion and `Record<string, T>` count) and plain-object typeof type-guards that narrow to those types.

Prefer:

```ts
const raw: unknown = await Bun.file(path).json();
const result = v.safeParse(Schema, raw);
export type Config = v.InferOutput<typeof Schema>;
```

On verify failure, the gate writes `.aqg/parse_example.ts` and emits `hint:bun-parse-handmade-json`.

## Enable

```yaml
presets:
  - bun-parse
```
