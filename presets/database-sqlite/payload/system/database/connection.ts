import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import * as v from 'valibot';
import { getOptionalEnv } from '@/system/config/environment';

const SHARED_SQLITE_STATE_KEY = Symbol.for('system.database.sqlite.connection-state.v1');

const SharedSqliteStateSchema = v.object({
  active: v.nullable(v.unknown()),
  filename: v.nullable(v.string()),
  generation: v.pipe(v.number(), v.integer(), v.minValue(0)),
  testOwned: v.boolean(),
});

type SharedSqliteState = {
  active: Database | null;
  filename: string | null;
  generation: number;
  testOwned: boolean;
};

function createSharedSqliteState(): SharedSqliteState {
  return { active: null, filename: null, generation: 0, testOwned: false };
}

function isSharedSqliteState(value: unknown): value is SharedSqliteState {
  const parsed = v.safeParse(SharedSqliteStateSchema, value);
  if (!parsed.success) {
    return false;
  }
  return parsed.output.active === null || parsed.output.active instanceof Database;
}

function sharedSqliteState(): SharedSqliteState {
  const existing: unknown = Reflect.get(globalThis, SHARED_SQLITE_STATE_KEY);
  if (existing !== undefined) {
    if (!isSharedSqliteState(existing)) {
      throw new Error('Invalid shared SQLite connection state');
    }
    return existing;
  }
  const created = createSharedSqliteState();
  Reflect.set(globalThis, SHARED_SQLITE_STATE_KEY, created);
  return created;
}

function configuredFilename(): string {
  const configured = getOptionalEnv('SQLITE_PATH') ?? 'data/app.sqlite';
  if (configured === ':memory:' || isAbsolute(configured)) {
    return configured;
  }
  return resolve(process.cwd(), configured);
}

function openDatabase(filename: string): Database {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const database = new Database(filename, { create: true, strict: true });
  database.run('PRAGMA foreign_keys = ON');
  database.run('PRAGMA busy_timeout = 5000');
  if (filename !== ':memory:') {
    database.run('PRAGMA journal_mode = WAL');
  }
  return database;
}

export function getDatabase(): Database {
  const state = sharedSqliteState();
  if (state.testOwned && state.active !== null) {
    return state.active;
  }

  const filename = configuredFilename();
  if (state.active !== null && state.filename === filename) {
    return state.active;
  }

  closeDatabase();
  state.active = openDatabase(filename);
  state.filename = filename;
  state.generation += 1;
  return state.active;
}

export function getDatabaseGeneration(): number {
  return sharedSqliteState().generation;
}

export function closeDatabase(): void {
  const state = sharedSqliteState();
  if (state.active !== null) {
    state.active.close(false);
    state.active = null;
    state.filename = null;
    state.testOwned = false;
    state.generation += 1;
  }
}

export function installDatabaseForTests(database: Database): void {
  closeDatabase();
  const state = sharedSqliteState();
  state.active = database;
  state.filename = null;
  state.testOwned = true;
  state.generation += 1;
}

export function releaseDatabaseForTests(): void {
  const state = sharedSqliteState();
  if (state.testOwned) {
    closeDatabase();
  }
}
