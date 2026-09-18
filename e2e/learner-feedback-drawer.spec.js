import { test, expect } from '@playwright/test';
import { stringify as devalueStringify } from 'devalue';

const REPORT = {
  id: 'feedback-browser-report',
  caseId: 'case-browser',
  reporterLabel: 'Browser Learner · learner@example.test',
  status: 'open',
  reportedAt: 1_700_000_000_000,
  body: 'The browser-visible report should stay until confirmed.'
};

async function mountDrawer(page, { reports = [REPORT], originFeedbackId = null, actionResult = '[{"ok":1,"report":2},true,null]' } = {}) {
  await page.goto('/');
  await page.setContent('<main id="drawer-host"></main>');
  await page.evaluate((actionResult) => {
    window.__drawerConfirm = false;
    window.__drawerDeleteRequests = [];
    window.__drawerMutations = [];
    window.confirm = () => window.__drawerConfirm;
    window.fetch = async (url, options = {}) => {
      const body = new URLSearchParams(options.body);
      window.__drawerDeleteRequests.push({
        url,
        method: options.method,
        body: Object.fromEntries(body.entries())
      });
      return {
        // SvelteKit action data is devalue-encoded before deserialize() parses it.
        text: async () => JSON.stringify({ type: 'success', status: 200, data: actionResult })
      };
    };
  }, actionResult);

  await page.addScriptTag({
    type: 'module',
    content: `
      window.__drawerReady = false;
      window.__drawerError = null;
      try {
        const [{ mount }, { default: LearnerFeedbackDrawer }] = await Promise.all([
          import('/@id/svelte'),
          import('/src/lib/components/case-editor/LearnerFeedbackDrawer.svelte')
        ]);
        window.__drawer = mount(LearnerFeedbackDrawer, {
          target: document.querySelector('#drawer-host'),
          props: {
            reports: ${JSON.stringify(reports)},
            caseId: 'case-browser',
            caseTitle: 'Browser Case',
            originFeedbackId: ${JSON.stringify(originFeedbackId)},
            returnQuery: 'status=open&query=browser',
            onmutated: (reports) => window.__drawerMutations.push(reports)
          }
        });
        window.__drawerReady = true;
      } catch (error) {
        window.__drawerError = String(error?.stack || error);
      }
    `
  });
  await expect.poll(() => page.evaluate(() => ({ ready: window.__drawerReady, error: window.__drawerError }))).toEqual({ ready: true, error: null });
}

test('drawer cancellation and confirmed delete stay on the focused local mutation path', async ({ page }) => {
  await mountDrawer(page);
  const initialUrl = page.url();
  const navigationEvents = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigationEvents.push(frame.url());
  });

  await expect(page.getByText(REPORT.body)).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect.poll(() => page.evaluate(() => window.__drawerDeleteRequests)).toEqual([]);
  await expect(page.getByText(REPORT.body)).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);

  await page.evaluate(() => { window.__drawerConfirm = true; });
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect.poll(() => page.evaluate(() => window.__drawerDeleteRequests)).toEqual([{
    url: '/admin/feedback?/delete',
    method: 'POST',
    body: {
      feedback_id: REPORT.id,
      drawer: '1',
      return_query: 'status=open&query=browser',
      confirm: 'DELETE'
    }
  }]);
  await expect(page.getByText('No reports in this Case.')).toBeVisible();
  await expect(page.getByText(REPORT.body)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__drawerMutations)).toEqual([[]]);
  expect(page.url()).toBe(initialUrl);
  expect(navigationEvents).toEqual([]);
});

test('resolving the final open report keeps it visible in previous reports', async ({ page }) => {
  const resolvedReport = { ...REPORT, status: 'resolved', reviewedAt: 1_700_000_000_100 };
  await mountDrawer(page, { actionResult: devalueStringify({ ok: true, report: resolvedReport }) });

  await page.getByRole('button', { name: 'Resolve' }).click();

  await expect(page.getByText(REPORT.body)).toBeVisible();
  await expect(page.getByText('resolved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide previous reports' })).toBeVisible();
  await expect(page.getByText('No open reports')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__drawerMutations.at(-1)?.[0]?.status)).toBe('resolved');
});

test('a resolved originating report is visible and selected alongside open reports', async ({ page }) => {
  const resolvedReport = {
    ...REPORT,
    id: 'feedback-browser-resolved-origin',
    status: 'resolved',
    body: 'The originating resolved report should remain visible.',
    reviewedAt: 1_700_000_000_100
  };
  await mountDrawer(page, { reports: [REPORT, resolvedReport], originFeedbackId: resolvedReport.id });

  await expect(page.getByText(resolvedReport.body)).toBeVisible();
  await expect(page.getByText('Selected report')).toBeVisible();
  await expect(page.getByText('resolved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide previous reports' })).toBeVisible();
});
