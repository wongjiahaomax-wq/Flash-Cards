import { test, expect } from '@playwright/test';

const studyReviewPath = process.env.STUDY_REVIEW_E2E_PATH;
const studyReviewEmail = process.env.STUDY_REVIEW_E2E_EMAIL;
const studyReviewPassword = process.env.STUDY_REVIEW_E2E_PASSWORD;
const frozenTitle = process.env.STUDY_REVIEW_E2E_TITLE;

test('Study Review protects the title until reveal and supports image inspection without losing position', async ({ page }) => {
  test.skip(
    !studyReviewPath || !studyReviewEmail || !studyReviewPassword || !frozenTitle,
    'Set STUDY_REVIEW_E2E_PATH, STUDY_REVIEW_E2E_EMAIL, STUDY_REVIEW_E2E_PASSWORD, and STUDY_REVIEW_E2E_TITLE for a seeded local active Review.'
  );

  const reviewPath = studyReviewPath.startsWith('/') ? studyReviewPath : `/${studyReviewPath}`;
  await page.goto(`/sign-in?redirect=${encodeURIComponent(reviewPath)}`);
  await page.getByLabel('Email or beta username').fill(studyReviewEmail);
  await page.getByLabel('Password').fill(studyReviewPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**${reviewPath}`);

  await expect(page.locator('h1')).toHaveText('Case review');
  expect(await page.content()).not.toContain(frozenTitle);

  const image = page.locator('.asset-image-button').first();
  await expect(image).toBeVisible();
  const imageUrl = await image.locator('img').getAttribute('src');
  expect(imageUrl).toMatch(/^\/study\/media\//);
  const caption = await page.locator('figure').first().locator('figcaption').textContent();

  const modal = page.getByRole('dialog');
  await image.click();
  await expect(modal).toBeVisible();
  await expect(modal.locator('img')).toHaveAttribute('src', imageUrl);
  if (caption?.trim()) await expect(modal).toContainText(caption.trim());

  await modal.getByRole('button', { name: 'Close' }).click();
  await expect(modal).toHaveCount(0);

  await page.locator('.asset-inspect-button').first().click();
  await expect(modal).toBeVisible();
  await page.locator('.asset-modal-backdrop').click({ position: { x: 2, y: 2 } });
  await expect(modal).toHaveCount(0);

  await image.click();
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  const scrollTop = await page.evaluate(() => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const target = Math.min(320, Math.max(0, maxScroll));
    window.scrollTo({ top: target, behavior: 'auto' });
    return window.scrollY;
  });
  expect(scrollTop).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Reveal answers' }).click();
  await expect(page.locator('h1')).toHaveText(frozenTitle);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(scrollTop - 8);
});
