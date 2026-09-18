import { fail, redirect } from '@sveltejs/kit';

import { feedbackQueryString, parseFeedbackQueueQuery } from '$lib/admin-feedback-state.js';
import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  LearnerFeedbackActionError,
  LearnerFeedbackInputError,
  bulkDeleteFeedback,
  deleteFeedback,
  dismissFeedback,
  listFeedbackQueue,
  reopenFeedback,
  resolveFeedback
} from '$lib/server/db/learner-feedback.ts';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function adminContext(locals, platform) {
  if (!canManageCaseAssets(locals.user)) return { failure: fail(403, { error: 'Administrator access is required.' }) };
  if (!platform?.env?.DB) return { failure: fail(503, { error: 'The study database is not configured.' }) };
  return { db: createDb(platform.env.DB), adminId: text(locals.user?.id) };
}

function actionFailure(errorValue) {
  if (errorValue instanceof LearnerFeedbackInputError) return fail(400, { error: errorValue.message });
  if (errorValue instanceof LearnerFeedbackActionError) return fail(409, { error: errorValue.message });
  console.error('Admin feedback action failed.', errorValue);
  return fail(500, { error: 'Unable to update feedback right now.' });
}

function queueRedirect(formData) {
  const query = feedbackQueryString(text(formData.get('return_query')));
  return '/admin/feedback' + (query ? '?' + query : '');
}

function drawerMode(formData) {
  return formData.get('drawer') === '1';
}

async function actionForm(request) {
  return await request.formData();
}

export async function load({ locals, platform, url }) {
  const filters = parseFeedbackQueueQuery(url.searchParams);
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) {
    return { filters, query: filters.query, groups: [], reportCount: 0 };
  }
  const queue = await listFeedbackQueue(createDb(platform.env.DB), filters);
  return { filters, query: filters.query, groups: queue.groups, reportCount: queue.reportCount };
}

export const actions = {
  resolve: async ({ request, locals, platform }) => {
    const context = adminContext(locals, platform);
    if (context.failure) return context.failure;
    const formData = await actionForm(request);
    let report;
    try {
      report = await resolveFeedback(context.db, { id: text(formData.get('feedback_id')), adminId: context.adminId });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    if (!report) return fail(409, { error: 'This feedback report was already changed. Refresh the queue.' });
    if (drawerMode(formData)) return { ok: true, report };
    redirect(303, queueRedirect(formData));
  },

  dismiss: async ({ request, locals, platform }) => {
    const context = adminContext(locals, platform);
    if (context.failure) return context.failure;
    const formData = await actionForm(request);
    let report;
    try {
      report = await dismissFeedback(context.db, { id: text(formData.get('feedback_id')), adminId: context.adminId });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    if (!report) return fail(409, { error: 'This feedback report was already changed. Refresh the queue.' });
    if (drawerMode(formData)) return { ok: true, report };
    redirect(303, queueRedirect(formData));
  },

  reopen: async ({ request, locals, platform }) => {
    const context = adminContext(locals, platform);
    if (context.failure) return context.failure;
    const formData = await actionForm(request);
    let report;
    try {
      report = await reopenFeedback(context.db, { id: text(formData.get('feedback_id')), adminId: context.adminId });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    if (!report) return fail(409, { error: 'This feedback report was already changed. Refresh the queue.' });
    if (drawerMode(formData)) return { ok: true, report };
    redirect(303, queueRedirect(formData));
  },

  delete: async ({ request, locals, platform }) => {
    const context = adminContext(locals, platform);
    if (context.failure) return context.failure;
    const formData = await actionForm(request);
    if (text(formData.get('confirm')) !== 'DELETE') return fail(400, { error: 'Confirm that this deletion cannot be undone.' });
    let deleted;
    try {
      deleted = await deleteFeedback(context.db, text(formData.get('feedback_id')));
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    if (!deleted) return fail(404, { error: 'This feedback report no longer exists.' });
    if (drawerMode(formData)) return { ok: true, report: null };
    redirect(303, queueRedirect(formData));
  },

  bulkDelete: async ({ request, locals, platform }) => {
    const context = adminContext(locals, platform);
    if (context.failure) return context.failure;
    const formData = await actionForm(request);
    if (text(formData.get('confirm')) !== 'DELETE') return fail(400, { error: 'Confirm that this deletion cannot be undone.' });
    try {
      await bulkDeleteFeedback(context.db, formData.getAll('feedback_id'));
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, queueRedirect(formData));
  }
};
