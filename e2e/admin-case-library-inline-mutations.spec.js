import { test, expect } from '@playwright/test';

const email = process.env.CASE_LIBRARY_E2E_EMAIL;
const password = process.env.CASE_LIBRARY_E2E_PASSWORD;
const commonCaseTitle = process.env.CASE_LIBRARY_E2E_COMMON_CASE_TITLE;
const commonTargetTopicId = process.env.CASE_LIBRARY_E2E_COMMON_TARGET_TOPIC_ID;
const commonTargetTopicName = process.env.CASE_LIBRARY_E2E_COMMON_TARGET_TOPIC_NAME;
const filteredCaseTitle = process.env.CASE_LIBRARY_E2E_FILTERED_CASE_TITLE;
const filteredTargetTopicId = process.env.CASE_LIBRARY_E2E_FILTERED_TARGET_TOPIC_ID;
const filteredTargetTopicName = process.env.CASE_LIBRARY_E2E_FILTERED_TARGET_TOPIC_NAME;
const filteredTargetSystemId = process.env.CASE_LIBRARY_E2E_FILTERED_TARGET_SYSTEM_ID;
const filteredQuery = process.env.CASE_LIBRARY_E2E_FILTERED_QUERY ?? 'system=__unassigned__';
const namedTargetTopicId = process.env.CASE_LIBRARY_E2E_NAMED_TARGET_TOPIC_ID;
const namedTargetTopicName = process.env.CASE_LIBRARY_E2E_NAMED_TARGET_TOPIC_NAME;
const namedTargetSystemId = process.env.CASE_LIBRARY_E2E_NAMED_TARGET_SYSTEM_ID;
const existingTagId = process.env.CASE_LIBRARY_E2E_EXISTING_TAG_ID;
const existingTagName = process.env.CASE_LIBRARY_E2E_EXISTING_TAG_NAME;

async function signIn(page) {
  await page.goto('/sign-in?redirect=%2Fadmin%2Fcases');
  await page.waitForTimeout(500);
  await page.getByLabel('Email or beta username').fill(email);
  await page.getByLabel('Password').fill(password);
  const signInResponse = page.waitForResponse((response) => response.url().includes('/api/auth/sign-in/email'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect((await signInResponse).status()).toBe(200);
  await page.waitForURL('**/admin/cases**');
}

function libraryRefreshRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/admin/cases/__data.json') requests.push(request);
  });
  return requests;
}

test('Case Library inline mutations reconcile locally and refresh only when composition changes', async ({ page }) => {
  test.skip(
    !email || !password || !commonCaseTitle || !commonTargetTopicId || !commonTargetTopicName ||
      !filteredCaseTitle || !filteredTargetTopicId || !filteredTargetTopicName || !filteredTargetSystemId ||
      !namedTargetTopicId || !namedTargetTopicName || !namedTargetSystemId || !existingTagId || !existingTagName,
    'Set CASE_LIBRARY_E2E_EMAIL, CASE_LIBRARY_E2E_PASSWORD, common/filtered/named-target variables, and existing-tag variables for the seeded local Production Case acceptance.'
  );

  await signIn(page);
  await page.goto('/admin/cases');
  await expect(page.getByRole('heading', { name: 'Active Cases' })).toBeVisible();

  const commonRefreshes = libraryRefreshRequests(page);
  const commonRow = page.locator('.table-row').filter({ hasText: commonCaseTitle });
  await expect(commonRow).toHaveCount(1);
  await commonRow.getByRole('button', { name: 'Edit classification' }).click();
  await commonRow.locator('select[id^="classification-topic-"]').selectOption(commonTargetTopicId);
  await commonRow.getByRole('button', { name: 'Save' }).click();
  await expect(commonRow).toContainText(commonTargetTopicName);
  expect(commonRefreshes).toHaveLength(0);

  await page.goto(`/admin/cases?topic=${encodeURIComponent(commonTargetTopicId)}`);
  const noOpRefreshes = libraryRefreshRequests(page);
  const noOpRow = page.locator('.table-row').filter({ hasText: commonCaseTitle });
  await expect(noOpRow).toHaveCount(1);
  await noOpRow.getByRole('button', { name: 'Edit classification' }).click();
  await noOpRow.locator('select[id^="classification-topic-"]').selectOption(commonTargetTopicId);
  await noOpRow.getByRole('button', { name: 'Save' }).click();
  await expect(noOpRow).toContainText(commonTargetTopicName);
  expect(noOpRefreshes).toHaveLength(0);

  await page.goto('/admin/cases');
  const tagRefreshes = libraryRefreshRequests(page);
  const tagRow = page.locator('.table-row').filter({ hasText: commonCaseTitle });
  await expect(tagRow).toHaveCount(1);
  await tagRow.getByText('Edit tags', { exact: true }).click();
  await tagRow.locator('select[id^="existing-tag-"]').selectOption(existingTagId);
  await tagRow.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(tagRow.locator('.tag-chip')).toContainText(existingTagName);
  expect(tagRefreshes).toHaveLength(0);

  await page.goto('/admin/cases?sort=edited-desc');
  const editedRefreshes = libraryRefreshRequests(page);
  const editedRow = page.locator('.table-row').filter({ hasText: commonCaseTitle });
  await expect(editedRow).toHaveCount(1);
  await editedRow.getByText('Edit tags', { exact: true }).click();
  await editedRow.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(editedRow.locator('.tag-chip')).toHaveCount(0);
  await expect.poll(() => editedRefreshes.length).toBeGreaterThan(0);

  await page.goto(`/admin/cases?${filteredQuery}`);
  const conditionalRefreshes = libraryRefreshRequests(page);
  const filteredRow = page.locator('.table-row').filter({ hasText: filteredCaseTitle });
  await expect(filteredRow).toHaveCount(1);
  await filteredRow.getByRole('checkbox', { name: new RegExp(`Select ${filteredCaseTitle}`) }).check();
  await filteredRow.getByRole('button', { name: 'Edit classification' }).click();
  await filteredRow.locator('select[id^="classification-system-"]').selectOption(filteredTargetSystemId);
  await filteredRow.locator('select[id^="classification-topic-"]').selectOption(filteredTargetTopicId);
  await filteredRow.getByRole('button', { name: 'Save' }).click();

  await expect(filteredRow).toHaveCount(0);
  await expect(page.locator('.bulk-toolbar')).toContainText('0 Cases selected');
  await expect.poll(() => conditionalRefreshes.length).toBeGreaterThan(0);
  await expect(page.locator('.table-row').filter({ hasText: filteredTargetTopicName })).toHaveCount(0);

  await page.goto(`/admin/cases?topic=${encodeURIComponent(filteredTargetTopicId)}`);
  const namedRefreshes = libraryRefreshRequests(page);
  const namedRow = page.locator('.table-row').filter({ hasText: filteredCaseTitle });
  await expect(namedRow).toHaveCount(1);
  await namedRow.getByRole('button', { name: 'Edit classification' }).click();
  await namedRow.locator('select[id^="classification-system-"]').selectOption(namedTargetSystemId);
  await namedRow.locator('select[id^="classification-topic-"]').selectOption(namedTargetTopicId);
  await namedRow.getByRole('button', { name: 'Save' }).click();
  await expect(namedRow).toHaveCount(0);
  await expect.poll(() => namedRefreshes.length).toBeGreaterThan(0);
  await expect(page.locator('.table-row').filter({ hasText: namedTargetTopicName })).toHaveCount(0);

  await page.goto(`/admin/cases?tag=${encodeURIComponent(existingTagId)}`);
  const filteredTagRefreshes = libraryRefreshRequests(page);
  const filteredTagRow = page.locator('.table-row').filter({ hasText: filteredCaseTitle });
  await expect(filteredTagRow).toHaveCount(1);
  await filteredTagRow.getByRole('checkbox', { name: new RegExp(`Select ${filteredCaseTitle}`) }).check();
  await filteredTagRow.getByText('Edit tags', { exact: true }).click();
  await filteredTagRow.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(filteredTagRow).toHaveCount(0);
  await expect(page.locator('.bulk-toolbar')).toContainText('0 Cases selected');
  await expect.poll(() => filteredTagRefreshes.length).toBeGreaterThan(0);
});
