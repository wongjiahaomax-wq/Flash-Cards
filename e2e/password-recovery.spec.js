import { test, expect } from '@playwright/test';

test('reset token fragment is captured and removed without entering request URLs or server data', async ({ page }) => {
  const sentinel = 'browser-only-reset-sentinel';
  const requestUrls = [];
  const resetRequest = page.waitForRequest((request) => request.url().endsWith('/api/auth/reset-password'));

  page.on('request', (request) => requestUrls.push(request.url()));
  const navigationResponse = await page.goto(`/reset-password#token=${encodeURIComponent(sentinel)}`);
  expect(navigationResponse).not.toBeNull();
  const initialDocument = await navigationResponse.text();
  expect(initialDocument).not.toContain(sentinel);

  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();
  await expect(page.locator('input[autocomplete="new-password"]').first()).toBeVisible();

  expect(page.url()).not.toContain(sentinel);

  await page.locator('input[autocomplete="new-password"]').nth(0).fill('NewBrowserPassword123!');
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('NewBrowserPassword123!');
  await page.getByRole('button', { name: 'Reset password' }).click();

  const request = await resetRequest;
  expect(request.url()).not.toContain(sentinel);
  expect(request.postData()).toContain(sentinel);
  for (const url of requestUrls) expect(url).not.toContain(sentinel);
});

test('forgot-password throttling returns a controlled enhanced-form error', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.setExtraHTTPHeaders({ 'cf-connecting-ip': '198.51.100.31' });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(`browser-throttle-${attempt}@example.test`);
    await page.getByRole('button', { name: 'Send reset instructions' }).click();
    await expect(page.getByText(/If an account exists for that email address/)).toBeVisible();
  }

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('browser-throttle-blocked@example.test');
  await page.getByRole('button', { name: 'Send reset instructions' }).click();

  await expect(page.getByRole('alert')).toHaveText(/Too many password reset requests/);
  await expect(page.getByRole('button', { name: 'Send reset instructions' })).toBeEnabled();
  await expect(page.getByText('Sending…')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
