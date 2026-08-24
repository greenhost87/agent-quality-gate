import pg from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Wait } from 'testcontainers';
import { closeDatabase } from '@/system/database/connection';
import { runDatabaseMigrations } from '@/system/database/migrate';
new PostgreSqlContainer();
void Wait;
void pg;
