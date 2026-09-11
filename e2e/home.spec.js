import { test, expect } from '@playwright/test';

test('home page renders', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Flash-Cards');
  await expect(page.getByRole('heading', { name: 'Flash-Cards' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
});
