# Preset: `database-sqlite`

Managed `bun:sqlite` connection, migrations, isolated database test hook, agent-facing examples, and boundaries for embedded SQLite projects.

## What it installs

| Kind                           | Detail                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Managed files                  | `system/database/connection.ts`, `system/database/migrate.ts`, `tests/setup/testDatabase.ts`                   |
| Examples                       | `.aqg/database-sqlite/database-examples.md` and `.aqg/database-sqlite/scripts/sync-database-sqlite-managed.ts` |
| Additional SQLite dependencies | none; `bun:sqlite` and `bun:test` are built into Bun, while required `config` supplies `valibot`               |
| Oxlint rules                   | `database-sqlite/boundaries`, `database-sqlite/test-boundaries`                                                |

The preset requires `config` transitively. It is an alternative to the PostgreSQL `database` preset; the two presets cannot be enabled together because they manage the same project files.

## Production contract

`getDatabase()` lazily opens one process-wide `Database`. `SQLITE_PATH` selects the database file and defaults to `data/app.sqlite`; relative paths resolve from the process working directory. The managed connection enables strict parameter binding and foreign keys, configures a busy timeout, and uses WAL for file-backed databases. `closeDatabase()` closes the active handle. `getDatabaseGeneration()` changes when the active handle changes so database-owned caches can invalidate stale state.

DAO files live at `system/database/<domain>/<name>.dao.ts`. DAO modules import `Database` as a type and receive the active database explicitly. They do not import the connection singleton or another DAO implementation. Application composition code obtains `getDatabase()` and passes it to DAO operations.

`bun system/database/migrate.ts` applies `migrations/*.sql` in lexicographic order. Each file runs in a transaction and is recorded in `schema_migrations`. Already recorded migrations are skipped. Verify treats migration files present in git `HEAD` as immutable: it restores edited or deleted files and writes the discarded diff to `.aqg/restored-migration.diff`. New uncommitted migration files remain editable.

## Test contract

`useIsolatedTestDatabase(import.meta.path)` is the only public test-database helper. Call it once at module scope. Its returned accessor is valid only inside a test or a hook registered after the managed hook.

The hook creates and migrates one strict in-memory template in `beforeAll`, snapshots it with `Database#serialize`, creates a fresh database with `Database.deserialize` in every `beforeEach`, and installs that handle as the production connection. `afterEach` closes it. Tests therefore exercise production DAOs against the normal `getDatabase()` state without Testcontainers, disk cleanup, or shared rows between tests.

Use the optional `migrationsDirectory` only when the project does not keep migrations at `<cwd>/migrations`:

```ts
const currentDatabase = useIsolatedTestDatabase(import.meta.path, {
  migrationsDirectory: '/absolute/project/migrations',
});
```

Do not use `test.concurrent`, `it.concurrent`, `describe.concurrent`, or a package script containing `bun test --concurrent` in database suites. File-level `bun test --parallel` remains supported because each test file receives an isolated Bun worker and process-global connection state.

Follow `.aqg/database-sqlite/database-examples.md` for a DAO and an integration test. The examples exercise the production DAO and are generated from typechecked TypeScript sources.

## Sync managed files

After verify refreshes `.aqg`, copy the managed `config` and `database-sqlite` files to their project destinations with the deterministic helper:

```bash
bun .aqg/database-sqlite/scripts/sync-database-sqlite-managed.ts
# or
bun .aqg/database-sqlite/scripts/sync-database-sqlite-managed.ts /path/to/project
```

Rerun verify after syncing.

## Bun references

- [SQLite runtime documentation](https://bun.com/docs/runtime/sqlite)
- [Bun test lifecycle hooks](https://bun.com/docs/test/lifecycle)

The managed APIs and examples use Bun's documented `Database`, strict queries, prepared-statement cache, transactions, `serialize` / `Database.deserialize`, close behavior, and test lifecycle hooks.

## Enable

```yaml
presets:
  - database-sqlite
```
