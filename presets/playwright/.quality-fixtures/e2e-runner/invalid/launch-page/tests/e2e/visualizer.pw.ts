import { chromium, test } from '@playwright/test';

test('opens chromium from the spec', async () => {
  await chromium.launch();
});
