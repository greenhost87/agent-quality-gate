# Preset: `n8n-lints`

Portable lint rules adapted from `@n8n/eslint-config` (`n8n-local-rules`). Test hygiene and string discipline for AI-assisted TypeScript work. Report-only; no autofixes.

Useless-catch and JSON deep-copy coverage moved to the mandatory AQG baseline (`no-useless-catch` in assets config; `aqg/no-json-parse-json-stringify`).

## What it installs

| Kind         | Detail                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Oxlint rules | `n8n-lints/*` ← `oxlint/index.ts` (bundled to `.js` on package/install) |

Requires: none. Managed files: none. Dependencies: none.

| Rule                                           | Flags                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `n8n-lints/no-skipped-tests`                   | `test.skip` / `.only` on `test`/`it`/`describe`, `xit`/`xtest`/`xdescribe` |
| `n8n-lints/no-error-instance-in-to-throw`      | `toThrow(new Foo())`; pass the class and message separately                |
| `n8n-lints/no-interpolation-in-regular-string` | `'...${...}...'` in quotes; use backticks                                  |
| `n8n-lints/no-unneeded-backticks`              | single-line `` `...` `` without interpolation; use quotes                  |
| `n8n-lints/no-unused-param-in-catch-clause`    | unused `catch (e)` (or `catch (_e)`); omit it via `catch {`                |

## Enable

```yaml
presets:
  - n8n-lints
```

## Known ceilings

- `no-skipped-tests` covers `skip`/`only` and the `x`-prefix on `test`/`it`/`describe` only (n8n parity). `fit`/`fdescribe`, `skipIf`/`runIf` are out of scope.
- `no-interpolation-in-regular-string` flags any quoted string containing `${`, including strings that document the syntax itself.
- `no-unneeded-backticks` skips tagged templates and multiline strings. Unlike the n8n original it never reports inside tag functions such as `` sql`...` ``.
- `no-unused-param-in-catch-clause` uses a syntactic reference scan (type annotations skipped). A use hidden in a destructuring-pattern default or behind an exotic declaration position may be missed (safe direction: missed report, never a false repair — the rule has no autofix).
