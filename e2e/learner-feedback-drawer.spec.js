import { test, expect } from '@playwright/test';

const REPORT = {
  id: 'feedback-browser-report',
  caseId: 'case-browser',
  reporterLabel: 'Browser Learner · learner@example.test',
  status: 'open',
  reportedAt: 1_700_000_000_000,
  body: 'The browser-visible report should stay until confirmed.'
};

async function mountDrawer(page) {
  await page.goto('/');
  await page.setContent('<main id="drawer-host"></main>');
  await page.evaluate(() => {
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
        text: async () => JSON.stringify({ type: 'success', status: 200, data: '[{"ok":1,"report":2},true,null]' })
      };
    };
  });

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
            reports: ${JSON.stringify([REPORT])},
            caseId: 'case-browser',
            caseTitle: 'Browser Case',
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
