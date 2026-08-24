import { expect, test } from '@playwright/test';

test('shows a running task', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link')).toBeVisible();
});
