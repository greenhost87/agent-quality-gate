import { Database } from 'bun:sqlite';
import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test';
import {
  getDatabase,
  installDatabaseForTests,
  releaseDatabaseForTests,
} from '@/system/database/connection';
import { runDatabaseMigrations } from '@/system/database/migrate';

export function useIsolatedTestDatabase(
  _testId: string,
  options: { migrationsDirectory?: string } = {},
): () => Database {
  let template: Buffer | null = null;
  let current: Database | null = null;

  beforeAll(() => {
    const database = new Database(':memory:', { strict: true });
    try {
      database.run('PRAGMA foreign_keys = ON');
      runDatabaseMigrations({ database, directory: options.migrationsDirectory });
      template = database.serialize();
    } finally {
      database.close(true);
    }
  });

  beforeEach(() => {
    if (template === null) {
      throw new Error('SQLite test template is not initialized');
    }
    current = Database.deserialize(template, { strict: true });
    current.run('PRAGMA foreign_keys = ON');
    installDatabaseForTests(current);
  });

  afterEach(() => {
    releaseDatabaseForTests();
    current = null;
  });

  afterAll(() => {
    releaseDatabaseForTests();
    current = null;
    template = null;
  });

  return () => {
    if (current === null) {
      throw new Error('SQLite test database is available only inside a test');
    }
    const active = getDatabase();
    if (active !== current) {
      throw new Error('SQLite test database is not the active production connection');
    }
    return current;
  };
}
