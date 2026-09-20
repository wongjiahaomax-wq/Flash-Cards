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
      !namedTargetTopicId || !namedTargetTopicName || !namedTargetSystemId,
    'Set CASE_LIBRARY_E2E_EMAIL, CASE_LIBRARY_E2E_PASSWORD, common-case variables, and filtered/named-target variables for the seeded local Production Case acceptance.'
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
});
