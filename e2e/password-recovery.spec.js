import { test, expect } from '@playwright/test';

test('reset token fragment is captured and removed without entering request URLs or server data', async ({ page }) => {
  const sentinel = 'browser-only-reset-sentinel';
  const requestUrls = [];
  const resetRequest = page.waitForRequest((request) => request.url().endsWith('/api/auth/reset-password'));

  page.on('request', (request) => requestUrls.push(request.url()));
  await page.goto(`/reset-password#token=${encodeURIComponent(sentinel)}`);

  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
  await expect(page.locator('input[autocomplete="new-password"]').first()).toBeVisible();

  const initialDocument = await page.content();
  expect(initialDocument).not.toContain(sentinel);
  expect(page.url()).not.toContain(sentinel);

  await page.locator('input[autocomplete="new-password"]').nth(0).fill('NewBrowserPassword123!');
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('NewBrowserPassword123!');
  await page.getByRole('button', { name: 'Reset password' }).click();

  const request = await resetRequest;
  expect(request.url()).not.toContain(sentinel);
  expect(request.postData()).toContain(sentinel);
  for (const url of requestUrls) expect(url).not.toContain(sentinel);
});
