import type { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getDatabase } from '@/system/database/connection';

function listMigrationFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function ensureMigrationLedger(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function appliedMigrationNames(database: Database): Set<string> {
  ensureMigrationLedger(database);
  const rows = database.query<{ name: string }, []>('SELECT name FROM schema_migrations').all();
  return new Set(rows.map((row) => row.name));
}

export function runDatabaseMigrations(options: DatabaseMigrationOptions = {}): void {
  const database = options.database ?? getDatabase();
  const directory = resolve(process.cwd(), options.directory ?? 'migrations');
  let migrationFiles: string[];
  try {
    migrationFiles = listMigrationFiles(directory);
  } catch {
    throw new Error(`Migrations directory not found at: ${directory}`);
  }

  const applied = appliedMigrationNames(database);
  const recordMigration = database.query('INSERT INTO schema_migrations (name) VALUES ($name)');
  const applyMigration = database.transaction((name: string, sqlText: string) => {
    database.run(sqlText);
    recordMigration.run({ name });
  });

  for (const name of migrationFiles) {
    if (applied.has(name)) {
      continue;
    }
    applyMigration(name, readFileSync(join(directory, name), 'utf8'));
  }
}

if (import.meta.main) {
  runDatabaseMigrations();
}

export type DatabaseMigrationOptions = {
  database?: Database;
  directory?: string;
};
