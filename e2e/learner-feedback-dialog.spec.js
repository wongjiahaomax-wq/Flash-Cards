import { test, expect } from '@playwright/test';
import { stringify as devalueStringify } from 'devalue';

const REVIEW_DATA = {
  review: {
    id: 'review-browser',
    studyMode: 'free',
    contentMode: 'original',
    vignette: 'A browser-mounted Review.',
    revealed: false,
    assets: [],
    questions: [{ prompt: 'What should be reviewed?', answer: 'The answer.' }]
  }
};

async function mountReview(page, { resultType = 'success', actionData = devalueStringify({ ok: true }), pending = false } = {}) {
  await page.goto('/');
  await page.setContent('<main id="review-host"></main>');
  await page.evaluate(({ resultType, actionData, pending }) => {
    window.__feedbackRequests = [];
    window.__feedbackPending = pending;
    window.fetch = async (url, options = {}) => {
      window.__feedbackRequests.push({ url, body: Object.fromEntries(options.body.entries()) });
      if (window.__feedbackPending) return new Promise(() => {});
      return {
        text: async () => JSON.stringify({ type: resultType, status: resultType === 'failure' ? 400 : 200, data: actionData })
      };
    };
  }, { resultType, actionData, pending });

  await page.addScriptTag({
    type: 'module',
    content: `
      window.__reviewReady = false;
      window.__reviewError = null;
      try {
        const [{ mount }, { default: ReviewPage }] = await Promise.all([
          import('/@id/svelte'),
          import('/src/routes/study/[reviewId]/+page.svelte')
        ]);
        window.__review = mount(ReviewPage, {
          target: document.querySelector('#review-host'),
          props: { data: ${JSON.stringify(REVIEW_DATA)} }
        });
        window.__reviewReady = true;
      } catch (error) {
        window.__reviewError = String(error?.stack || error);
      }
    `
  });
  await expect.poll(() => page.evaluate(() => ({ ready: window.__reviewReady, error: window.__reviewError }))).toEqual({ ready: true, error: null });
}

test('successful learner feedback closes the dialog, acknowledges, and stays on the Review', async ({ page }) => {
  await mountReview(page);
  const reviewUrl = page.url();

  await page.getByRole('button', { name: 'Report an issue' }).click();
  await page.getByLabel('What should we review?').fill('The answer for question 1 is unclear.');
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('Thanks — your feedback was submitted.');
  expect(page.url()).toBe(reviewUrl);
});

test('failed learner feedback keeps the dialog open and preserves entered text', async ({ page }) => {
  await mountReview(page, { resultType: 'failure', actionData: devalueStringify({ error: 'Unable to submit feedback right now.' }) });
  const enteredText = 'The image for this Case is unclear.';

  await page.getByRole('button', { name: 'Report an issue' }).click();
  const textarea = page.getByLabel('What should we review?');
  await textarea.fill(enteredText);
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(textarea).toHaveValue(enteredText);
  await expect(page.getByRole('alert')).toHaveText('Unable to submit feedback right now.');
});

test('pending learner feedback cannot be dismissed by Cancel, Escape, or backdrop', async ({ page }) => {
  await mountReview(page, { pending: true });

  await page.getByRole('button', { name: 'Report an issue' }).click();
  await page.getByLabel('What should we review?').fill('Please review this question.');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('button', { name: 'Submitting…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  const dialogBox = await page.getByRole('dialog').boundingBox();
  if (!dialogBox) throw new Error('Feedback dialog did not expose a browser box.');
  await page.mouse.click(Math.max(1, dialogBox.x - 12), Math.max(1, dialogBox.y - 12));
  await expect(page.getByRole('dialog')).toBeVisible();
});
