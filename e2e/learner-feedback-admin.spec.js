import { test, expect } from '@playwright/test';

const REPORT_A = {
  id: 'feedback-a', caseId: 'case-browser', reporterLabel: 'Learner A', caseTitleSnapshot: 'Browser Case',
  body: 'First report.', status: 'open', reportedAt: 1_700_000_000_000, currentCaseId: 'case-browser',
  currentCaseTitle: 'Browser Case', caseIsActive: true
};
const REPORT_B = { ...REPORT_A, id: 'feedback-b', reporterLabel: 'Learner B', body: 'Specific second report.' };

async function mountQueue(page) {
  await page.goto('/');
  await page.setContent('<main id="feedback-host"></main>');
  await page.addScriptTag({
    type: 'module',
    content: `
      window.__feedbackQueueReady = false;
      window.__feedbackQueueError = null;
      try {
        const [{ mount }, { default: FeedbackPage }] = await Promise.all([
          import('/@id/svelte'),
          import('/src/routes/admin/feedback/+page.svelte')
        ]);
        window.__feedbackQueue = mount(FeedbackPage, {
          target: document.querySelector('#feedback-host'),
          props: {
            data: ${JSON.stringify({
              filters: { status: 'open', search: '', sort: 'newest', page: 1 },
              query: 'status=open&sort=newest',
              groups: [{ caseId: 'case-browser', caseTitle: 'Browser Case', caseTitleSnapshot: 'Browser Case', caseExists: true, caseIsActive: true, reports: [REPORT_A, REPORT_B] }],
              reportCount: 2
            })},
            form: null
          }
        });
        window.__feedbackQueueReady = true;
      } catch (error) {
        window.__feedbackQueueError = String(error?.stack || error);
      }
    `
  });
  await expect.poll(() => page.evaluate(() => ({ ready: window.__feedbackQueueReady, error: window.__feedbackQueueError }))).toEqual({ ready: true, error: null });
}

test('opening a specific Admin report carries that report id to its Case action', async ({ page }) => {
  await mountQueue(page);

  await page.getByRole('button', { name: 'Open feedback report from Learner B' }).click();
  const caseLink = page.getByRole('dialog').getByRole('link', { name: 'Open Case Editor' });
  await expect(caseLink).toBeVisible();
  await expect(caseLink).toHaveAttribute('href', /feedback_id=feedback-b/);
  await expect(caseLink).toHaveAttribute('href', /feedback_return=status%3Dopen%26sort%3Dnewest/);
});
