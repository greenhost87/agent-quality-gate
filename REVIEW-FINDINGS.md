# Uncommitted changes review — 2026-08-27

Working notes from reviewing the dirty tree (mainly `bun-parse` expansion + valibot dogfooding). Bugbot did not run (usage limit).

## Verdict

Cohesive work: three new `bun-parse` rules, gate hint `bun-parse-json`, verify helpers moved to `gate/public-verify/`, and repo-wide replacement of raw `JSON.parse` / typeof-object guards with Bun + valibot. Direction is sound; address findings below before commit/PR.

## Findings

### F1 — False positive: `Bun.file` via binding

`no-raw-json-parse` only allows `.json()` when the receiver is a **direct** `Bun.file(...)` or imported `file(...)` call.

Banned today (even when followed by `v.parse`):

```ts
const f = Bun.file(path);
const raw = await f.json();
return v.parse(Schema, raw);
```

**Options:** document as unsupported, or track Bun.file / `file` bindings the same way valibot/file imports are tracked.

**Where:** `presets/bun-parse/oxlint/no-raw-json-parse.ts` (`isAllowedJsonReceiver` / `isBunFileJsonCall`).

### F2 — Split hints for one preset family

| Diagnostic                                                    | Compact hint                   | Artifact                       |
| ------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| `no-handmade-json-types`                                      | `hint:bun-parse-handmade-json` | `.aqg/parse_example.ts`        |
| `no-raw-json-parse`, `no-typeof-object`, `scripts-boundaries` | `hint:bun-parse-json`          | `.aqg/hints/bun-parse-json.md` |

`bun-parse-json.md` body claims to cover handmade types, but handmade markers never set `bunParseJson` / materialize that doc.

**Options:** route handmade onto the same hint doc, or stop claiming handmade coverage in the new doc.

**Where:** `gate/quality-gate-run/quality-gate-run.ts` (`HANDMADE_JSON_*` vs `BUN_PARSE_JSON_*`), `gate/quality-gate-run/hint-docs.ts`.

### F3 — Duplicate reports on plain-object recipes

The recipe `typeof … === 'object' && … !== null && !Array.isArray(…)` can fire:

- `no-handmade-json-types` → `handmadeGuard`
- `no-typeof-object` → typeof + (in `strict`) Array.isArray

README acknowledges overlap; verify output will be noisier.

**Where:** `presets/bun-parse/oxlint/handmade-json-guards.ts`, `presets/bun-parse/oxlint/no-typeof-object.ts`.

### F4 — `scripts-boundaries` alias coverage

Resolves only `@/…` and relative (`./` / `../`) into `scripts/`. `#/`, custom tsconfig paths, and other aliases are false negatives.

**Where:** `presets/bun-parse/oxlint/scripts-boundaries.ts` (`resolveProjectImport`).

### F5 — Invalid `typeofObjectMode` is silent

Bad / typo values make `parsePresetConfig` return `undefined`; `applyConfiguredRules` no-ops and the rule stays at default `strict`.

**Prefer:** fail config load / verify with a clear error.

**Where:** `presets/bun-parse/gate-config.ts`.

### F6 — Untracked files are load-bearing

Must be staged for the feature/tests to ship, including:

- `presets/bun-parse/gate-config.ts`
- `presets/bun-parse/gate-config.types.ts`
- helpers: `bun-file-bindings.ts`, `for-each-import-from.ts`, `import-specifier-name.ts`, `no-typeof-object.types.ts`, …
- fixtures under `presets/bun-parse/.quality-fixtures/no-raw-json-parse/{invalid/unrelated-file-json,valid/module-scope,valid/renamed-file-import}/`

Without these, `typeofObjectMode` and several system/replay cases do not land.

## What looked solid

- Bun JSON validation path (`isValidatedRawCall`, module-scope, renamed `file` import) matches tests.
- `preset-verify-result` / `verify-streams` move into `gate/public-verify` cleans scripts→gate coupling.
- `readJsonFile(path, schema)` call sites appear updated.
- Adapter `typeof content === 'string' ? undefined : content` matches the valibot string|array union and avoids the typeof ban.

## Branch / process notes

- Dirty tree ~107 files; branch was ahead/behind remote — rebase/merge before PR.
- Do not treat this file as product docs; delete or relocate once findings are resolved or filed as issues.

## Suggested order of work

1. Stage **F6** untracked bun-parse files.
2. Decide **F1** (doc vs binding tracking) and **F2** (unify hints).
3. Optionally harden **F5**; document or extend **F4**; accept or reduce **F3** noise.
4. Re-run pack/system tests for `bun-parse`, then root `bun run verify` / targeted suites.
