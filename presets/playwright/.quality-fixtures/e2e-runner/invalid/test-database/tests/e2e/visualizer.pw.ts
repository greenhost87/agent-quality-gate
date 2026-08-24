import { test } from '@playwright/test';
import { useIsolatedTestDatabase } from '../setup/testDatabase.ts';

useIsolatedTestDatabase(import.meta.path);

test('seeds through bun test database', () => {});
