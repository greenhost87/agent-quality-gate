import { test } from '@playwright/test';
import { useIsolatedTestDatabase } from 'agent-quality-gate/internal/presets/playwright/.quality-fixtures/e2e-runner/invalid/test-database/tests/setup/testDatabase.ts';

useIsolatedTestDatabase(import.meta.path);

test('seeds through bun test database', () => {});
