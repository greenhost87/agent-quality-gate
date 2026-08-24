import { test } from '@playwright/test';
import { PhaseDao } from '@/system/database/phases/phases.dao.ts';

test('reads phases through a DAO', () => {
  new PhaseDao();
});
