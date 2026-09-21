import { test, expect } from '@playwright/test';
import { stringify as devalueStringify } from 'devalue';

const email = process.env.STUDY_COMPLETION_E2E_EMAIL;
const password = process.env.STUDY_COMPLETION_E2E_PASSWORD;
const completionRunId = 'browser-completion-regression';
const completionToken = 'browser-completion-token';
const completionStorageKey = 'flash-cards:study-completion:' + completionRunId;
const plannerError = 'Planner failed intentionally for completion regression.';

async function signIn(page) {
  await page.goto('/sign-in?redirect=%2Fstudy');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByLabel('Email or beta username').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/study');
}

async function showCompletionSummary(page) {
  await page.evaluate(({ key, token, runId }) => {
    sessionStorage.setItem(key, JSON.stringify({
      token,
      summary: {
        version: 1,
        runId,
        mode: 'Scheduled Study',
        completedDistinct: 2,
        repeatCount: null,
        target: 5
      }
    }));
  }, { key: completionStorageKey, token: completionToken, runId: completionRunId });
  await page.goto('/study?runStatus=complete&completionRun=' + completionRunId + '&completionToken=' + completionToken);
  await expect(page.getByRole('heading', { name: 'Scheduled Study finished' })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), completionStorageKey)).toBeNull();
}

test.describe('Study completion summary regressions', () => {
  test.beforeEach(() => {
    test.skip(
      !email || !password,
      'Set STUDY_COMPLETION_E2E_EMAIL and STUDY_COMPLETION_E2E_PASSWORD for a clean local learner without an active Review or resumable run.'
    );
  });

  test('Return to Study dismisses the one-time completion summary', async ({ page }) => {
    await signIn(page);
    await showCompletionSummary(page);

    await page.getByRole('link', { name: 'Return to Study', exact: true }).click();
    await expect(page).toHaveURL(/\/study$/);
    await expect(page.getByRole('heading', { name: 'Scheduled Study finished' })).toHaveCount(0);
    await expect(page.locator('.completion-card')).toHaveCount(0);
  });

  test('planner failures remain visible after leaving the completion summary', async ({ page }) => {
    await signIn(page);
    await showCompletionSummary(page);
    await page.getByRole('button', { name: 'Start another session', exact: true }).click();
    await expect(page.locator('.completion-card')).toHaveCount(0);

    await page.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (route.request().method() !== 'POST' || requestUrl.search !== '?/plan') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'failure',
          status: 400,
          data: devalueStringify({ message: plannerError })
        })
      });
    });

    const planForm = page.locator('form[action="?/plan"]').first();
    await expect(planForm).toBeVisible();
    await planForm.locator('button[type="submit"]').first().click();
    await expect(page.getByRole('alert')).toHaveText(plannerError);
    await expect(page.getByText(plannerError, { exact: true })).toBeVisible();
  });
});
