import { createDb } from '$lib/server/db/index.js';
import { ActiveReviewContentError } from '$lib/server/db/active-review-content.js';
import {
  ActiveReviewError,
  createFreeActiveReview,
  createScheduledActiveReview,
  getActiveReview
} from '$lib/server/db/active-reviews.js';
import { beginFreeWork, selectNextFreeWork, skipFreeWork } from '$lib/free-study-run.js';
import { beginScheduledWork, selectNextScheduledWork, skipScheduledWork } from '$lib/scheduled-study-run.js';
import {
  learnerStudyAccessError,
  learnerStudyProofSecret,
  validateLearnerStudyRunOwner
} from '$lib/server/learning/learner-study-runtime.js';

/** @param {unknown} body @param {number} [status] */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** @param {unknown} cause */
function skippableOpenError(cause) {
  if (cause instanceof ActiveReviewContentError) return cause.code === 'content-unavailable';
  return cause instanceof ActiveReviewError
    && ['stale-case-state', 'ineligible-scope', 'content-unavailable'].includes(cause.code);
}

export async function POST({ locals, platform, request }) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) return json({ message: access.message }, access.status);
  if (!locals.user || !platform?.env?.DB) return json({ message: 'Study database is not configured.' }, 503);

  /** @type {any} */
  let descriptor;
  try {
    descriptor = (await request.json())?.descriptor;
  } catch {
    return json({ message: 'Invalid Study run payload.' }, 400);
  }
  const ownership = validateLearnerStudyRunOwner(descriptor, locals.user.id);
  if (!ownership.ok) return json({ message: ownership.message }, ownership.status);
  descriptor = ownership.descriptor;

  const db = createDb(platform.env.DB);
  const existing = await getActiveReview(db, locals.user.id);
  if (existing) {
    return json({
      status: 'resume',
      reviewId: existing.id,
      message: 'An active Review already exists. Resume or discard it before opening more work.'
    }, 409);
  }

  const proofSecret = learnerStudyProofSecret(platform.env);
  try {
    if (descriptor.kind === 'scheduled') {
      while (true) {
        const selection = selectNextScheduledWork(descriptor, { serverNow: new Date() });
        if (selection.status !== 'ready') return json({ ...selection, descriptor });
        const work = selection.work;
        let opened;
        try {
          opened = await createScheduledActiveReview({
            db,
            userId: locals.user.id,
            systemId: descriptor.selectedScope.systemId,
            routes: descriptor.selectedScope.routes,
            caseId: work.caseId,
            queueClass: work.queueClass,
            runBoundaryToken: descriptor.runBoundaryToken,
            workProof: work.workProof,
            proofSecret,
            now: new Date()
          });
        } catch (cause) {
          if (!skippableOpenError(cause)) throw cause;
          descriptor = skipScheduledWork(descriptor, work);
          continue;
        }
        if (
          opened.review.runId !== descriptor.runId
          || opened.review.caseId !== work.caseId
          || opened.review.queueClass !== work.queueClass
        ) {
          return json({ status: 'resume', reviewId: opened.review.id, message: 'Another active Review won the open race.' }, 409);
        }
        return json({
          status: 'review',
          reviewId: opened.review.id,
          descriptor: beginScheduledWork(descriptor, work, opened.review.id)
        });
      }
    }

    if (descriptor.kind === 'free') {
      while (true) {
        const selection = selectNextFreeWork(descriptor);
        if (selection.status !== 'ready') return json({ ...selection, descriptor });
        let opened;
        try {
          opened = await createFreeActiveReview({
            db,
            userId: locals.user.id,
            systemId: descriptor.selectedScope.systemId,
            routes: descriptor.selectedScope.routes,
            caseId: selection.caseId,
            runId: descriptor.runId
          });
        } catch (cause) {
          if (!skippableOpenError(cause)) throw cause;
          descriptor = skipFreeWork(descriptor, selection.caseId);
          continue;
        }
        if (opened.review.runId !== descriptor.runId || opened.review.caseId !== selection.caseId) {
          return json({ status: 'resume', reviewId: opened.review.id, message: 'Another active Review won the open race.' }, 409);
        }
        return json({
          status: 'review',
          reviewId: opened.review.id,
          descriptor: beginFreeWork(descriptor, selection.caseId, opened.review.id)
        });
      }
    }

    return json({ message: 'Unsupported Study run descriptor.' }, 400);
  } catch (cause) {
    return json({ message: cause instanceof Error ? cause.message : String(cause) }, 400);
  }
}
