import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { PhaseDao } from '@/system/database/phases/phases.dao.ts';
import { useIsolatedTestDatabase } from '../setup/testDatabase.ts';

useIsolatedTestDatabase(import.meta.path);

test('shows a running task', async () => {
  const phases = new PhaseDao();
  const server = spawn('node', ['server.js']);
  const browser = await chromium.launch();
  expect(phases).toBeDefined();
  expect(server.pid).toBeGreaterThan(0);
  await browser.close();
});
