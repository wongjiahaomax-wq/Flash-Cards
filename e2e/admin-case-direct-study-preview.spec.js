import { test, expect } from '@playwright/test';

const caseEditorPath = process.env.CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_PATH;
const email = process.env.CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_EMAIL;
const password = process.env.CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_PASSWORD;
const caseTitle = process.env.CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_TITLE;
const fixtureHasImage = process.env.CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_HAS_IMAGE === '1';

test('Production Case Editor opens the exact Case in read-only direct Study Preview', async ({ page }) => {
  test.skip(
    !caseEditorPath || !email || !password || !caseTitle,
    'Set CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_PATH, CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_EMAIL, CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_PASSWORD, and CASE_EDITOR_DIRECT_STUDY_PREVIEW_E2E_TITLE for a seeded local Production Case.'
  );

  const editorPath = caseEditorPath.startsWith('/') ? caseEditorPath : `/${caseEditorPath}`;
  const editorUrl = new URL(editorPath, 'http://localhost');
  const expectedCaseId = decodeURIComponent(editorUrl.pathname.split('/').filter(Boolean).at(-1));
  const expectedReturnQuery = editorUrl.searchParams.get('return_query');
  await page.goto(`/sign-in?redirect=${encodeURIComponent(editorPath)}`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email or beta username').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**${editorPath}`);

  await page.getByRole('link', { name: 'Preview in Study', exact: true }).click();
  await page.waitForURL('**/admin/study-preview?mode=direct&caseId=*');
  expect(new URL(page.url()).pathname).toBe('/admin/study-preview');
  expect(new URL(page.url()).searchParams.get('mode')).toBe('direct');
  expect(new URL(page.url()).searchParams.get('caseId')).toBe(expectedCaseId);
  expect(new URL(page.url()).searchParams.get('return_query')).toBe(expectedReturnQuery);

  await expect(page.getByRole('heading', { name: 'Case review', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal answers', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Again|Hard|Good|Easy|Complete Free Review/ })).toHaveCount(0);

  const image = page.locator('[data-direct-case-preview] .asset-image-button').first();
  if (fixtureHasImage) await expect(image).toBeVisible();
  if (await image.count()) {
    const imageUrl = await image.locator('img').getAttribute('src');
    expect(imageUrl).toMatch(/^\/api\/assets\/.*\/image$/);
    await image.click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.locator('img')).toHaveAttribute('src', imageUrl);
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).toHaveCount(0);
  }

  await page.getByRole('button', { name: 'Reveal answers', exact: true }).click();
  await expect(page.getByRole('heading', { name: caseTitle, exact: true })).toBeVisible();
  await expect(page.getByText('Answers revealed', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Case Editor', exact: true }).last()).toBeVisible();

  await page.getByRole('link', { name: 'Back to Case Editor', exact: true }).last().click();
  await page.waitForURL(`**${editorPath}`);
  expect(new URL(page.url()).searchParams.get('return_query')).toBe(expectedReturnQuery);
  await expect(page.getByRole('heading', { name: caseTitle, exact: true })).toBeVisible();
});
