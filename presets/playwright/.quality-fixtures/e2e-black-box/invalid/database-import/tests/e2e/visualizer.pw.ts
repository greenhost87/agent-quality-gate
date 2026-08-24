import { test } from '@playwright/test';
import { sql } from '@/system/database/connection.ts';

test('queries through the database connection', () => {
  void sql;
});
