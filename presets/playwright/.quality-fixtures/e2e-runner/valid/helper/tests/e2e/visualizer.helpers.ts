import { expect, type Page } from '@playwright/test';

export async function expectTaskRow(page: Page): Promise<void> {
  await expect(page.getByRole('link')).toBeVisible();
}
