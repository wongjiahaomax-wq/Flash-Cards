import { createDb } from '../src/lib/server/db/index.js';
import {
  createFreeActiveReview,
  createScheduledActiveReview,
  revealActiveReview
} from '../src/lib/server/db/active-reviews.js';
import { completeFreeReview } from '../src/lib/server/db/free-review-completion.js';
import { completeScheduledReview } from '../src/lib/server/db/scheduled-review-completion.js';
import {
  planFreeMultiSystemStudyRun,
  planScheduledMultiSystemStudyRun
} from '../src/lib/server/db/study-run-planning.js';
import { validateLearnerStudyRunOwner } from '../src/lib/server/learning/learner-study-runtime.js';
import {
  applyFreeCompletion,
  beginFreeWork,
  selectNextFreeWork
} from '../src/lib/free-study-run.js';
import {
  applyScheduledCompletion,
  beginScheduledWork,
  selectNextScheduledWork
} from '../src/lib/scheduled-study-run.js';

const PROOF_SECRET = 'multi-system-v2-cross-navigation-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const SYSTEM_A = 'multi-v2-nav-system-a';
const SYSTEM_B = 'multi-v2-nav-system-b';
const CASE_A = 'multi-v2-nav-case-a';
const CASE_B = 'multi-v2-nav-case-b';
const SCHEDULED_USER = 'multi-v2-nav-scheduled-user';
const FREE_USER = 'multi-v2-nav-free-user';

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

function systems() {
  return [
    { systemId: SYSTEM_A, mode: 'all' },
    { systemId: SYSTEM_B, mode: 'all' }
  ];
}

function deterministicNoShuffle() {
  return 0.999999;
}

function ownedDescriptor(descriptor, userId) {
  const withTarget = { ...descriptor, distinctCaseTarget: null };
  const ownership = validateLearnerStudyRunOwner(withTarget, userId);
  if (!ownership.ok) throw new Error(`Descriptor ownership validation failed: ${ownership.message}`);
  return ownership.descriptor;
}

async function openScheduled(db, descriptor, work, userId, now) {
  const opened = await createScheduledActiveReview({
    db,
    userId,
    runScope: descriptor.selectedScope,
    caseId: work.caseId,
    queueClass: work.queueClass,
    expectedStateRevision: work.stateRevision,
    expectedDueAt: work.dueAt,
    runBoundaryToken: descriptor.runBoundaryToken,
    workProof: work.workProof,
    proofSecret: PROOF_SECRET,
    now,
    rng: deterministicNoShuffle
  });
  expect(opened.status === 'created', `Scheduled open for ${work.caseId} returned ${opened.status}.`);
  return opened.review;
}

async function runScheduledCrossNavigation(env) {
  const db = createDb(env.DB);
  const startedAt = Date.now() - 5_000;
  let descriptor = ownedDescriptor(await planScheduledMultiSystemStudyRun({
    db,
    userId: SCHEDULED_USER,
    systems: systems(),
    proofSecret: PROOF_SECRET,
    now: startedAt,
    rng: deterministicNoShuffle,
    runId: 'multi-v2-nav-scheduled-run',
    membershipChunkSize: 1
  }), SCHEDULED_USER);

  expect(descriptor.version === 2 && descriptor.kind === 'scheduled', 'Scheduled cross-navigation planner did not emit descriptor v2.');
  expect(descriptor.capturedNew.map((entry) => entry.caseId).join(',') === `${CASE_A},${CASE_B}`, 'Scheduled planner did not capture deterministic A then B Cases.');

  const firstSelection = selectNextScheduledWork(descriptor, { serverNow: startedAt + 100 });
  expect(firstSelection.status === 'ready', `Scheduled first selection returned ${firstSelection.status}.`);
  expect(firstSelection.work.caseId === CASE_A, 'Scheduled first work was not the System A Case.');

  const firstReview = await openScheduled(db, descriptor, firstSelection.work, SCHEDULED_USER, startedAt + 200);
  expect(firstReview.systemId === SYSTEM_A, 'Scheduled first open was not concretely attributed to System A.');
  descriptor = beginScheduledWork(descriptor, firstSelection.work, firstReview.id);
  const firstReveal = await revealActiveReview({ db, userId: SCHEDULED_USER, reviewId: firstReview.id });
  expect(firstReveal?.revealedAt, 'Scheduled first Review did not reveal.');
  const firstCompletion = await completeScheduledReview({
    db,
    userId: SCHEDULED_USER,
    reviewId: firstReview.id,
    rating: 'good',
    runBoundaryToken: descriptor.runBoundaryToken,
    proofSecret: PROOF_SECRET,
    now: startedAt + 500
  });
  expect(firstCompletion.status === 'completed', `Scheduled first completion returned ${firstCompletion.status}.`);
  descriptor = applyScheduledCompletion(descriptor, {
    eventId: firstCompletion.eventId,
    caseId: firstCompletion.caseId,
    queueClass: firstCompletion.queueClass,
    repeatEntry: firstCompletion.repeatEntry
  });

  const secondSelection = selectNextScheduledWork(descriptor, { serverNow: startedAt + 600 });
  expect(secondSelection.status === 'ready', `Scheduled next selection returned ${secondSelection.status}.`);
  expect(secondSelection.work.caseId === CASE_B, 'Scheduled completion did not advance to the System B Case.');

  const secondReview = await openScheduled(db, descriptor, secondSelection.work, SCHEDULED_USER, startedAt + 700);
  expect(secondReview.systemId === SYSTEM_B, 'Scheduled next-open was not concretely attributed to System B.');
  expect(secondReview.selectedScope?.runScope?.systems?.length === 2, 'Scheduled next-open lost the multi-System run scope.');
  descriptor = beginScheduledWork(descriptor, secondSelection.work, secondReview.id);
  const secondReveal = await revealActiveReview({ db, userId: SCHEDULED_USER, reviewId: secondReview.id });
  expect(secondReveal?.revealedAt, 'Scheduled second Review did not reveal.');
  const secondCompletion = await completeScheduledReview({
    db,
    userId: SCHEDULED_USER,
    reviewId: secondReview.id,
    rating: 'good',
    runBoundaryToken: descriptor.runBoundaryToken,
    proofSecret: PROOF_SECRET,
    now: startedAt + 1_000
  });
  expect(secondCompletion.status === 'completed', `Scheduled second completion returned ${secondCompletion.status}.`);

  const residual = await env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM active_reviews WHERE user_id = ?) AS active_reviews,
      (SELECT count(*) FROM scheduled_review_events WHERE user_id = ?) AS scheduled_events
  `).bind(SCHEDULED_USER, SCHEDULED_USER).first();
  expect(Number(residual?.active_reviews) === 0, 'Scheduled cross-navigation left an Active Review.');
  expect(Number(residual?.scheduled_events) === 2, 'Scheduled cross-navigation did not commit exactly two Review events.');

  return {
    first: { caseId: firstReview.caseId, systemId: firstReview.systemId },
    second: { caseId: secondReview.caseId, systemId: secondReview.systemId },
    secondOpenRunScopeSystems: secondReview.selectedScope.runScope.systems.length,
    scheduledEvents: Number(residual.scheduled_events)
  };
}

async function runFreeCrossNavigation(env) {
  const db = createDb(env.DB);
  const startedAt = Date.now() - 5_000;
  let descriptor = ownedDescriptor(await planFreeMultiSystemStudyRun({
    db,
    userId: FREE_USER,
    systems: systems(),
    now: startedAt,
    rng: deterministicNoShuffle,
    runId: 'multi-v2-nav-free-run'
  }), FREE_USER);

  expect(descriptor.version === 2 && descriptor.kind === 'free', 'Free cross-navigation planner did not emit descriptor v2.');
  expect(descriptor.bag.join(',') === `${CASE_A},${CASE_B}`, 'Free planner did not produce deterministic A then B Cases.');

  const firstSelection = selectNextFreeWork(descriptor);
  expect(firstSelection.status === 'ready' && firstSelection.caseId === CASE_A, 'Free first work was not the System A Case.');
  const firstOpened = await createFreeActiveReview({
    db,
    userId: FREE_USER,
    runScope: descriptor.selectedScope,
    caseId: firstSelection.caseId,
    runId: descriptor.runId,
    rng: deterministicNoShuffle
  });
  expect(firstOpened.status === 'created', `Free first open returned ${firstOpened.status}.`);
  expect(firstOpened.review.systemId === SYSTEM_A, 'Free first open was not concretely attributed to System A.');
  descriptor = beginFreeWork(descriptor, firstSelection.caseId, firstOpened.review.id);
  const firstReveal = await revealActiveReview({ db, userId: FREE_USER, reviewId: firstOpened.review.id });
  expect(firstReveal?.revealedAt, 'Free first Review did not reveal.');
  const firstCompletion = await completeFreeReview({
    db,
    userId: FREE_USER,
    reviewId: firstOpened.review.id,
    now: startedAt + 500
  });
  expect(firstCompletion.status === 'completed', `Free first completion returned ${firstCompletion.status}.`);
  descriptor = applyFreeCompletion(descriptor, {
    receiptId: firstCompletion.receiptId,
    caseId: firstCompletion.caseId
  });

  const secondSelection = selectNextFreeWork(descriptor);
  expect(secondSelection.status === 'ready' && secondSelection.caseId === CASE_B, 'Free completion did not advance to the System B Case.');
  const secondOpened = await createFreeActiveReview({
    db,
    userId: FREE_USER,
    runScope: descriptor.selectedScope,
    caseId: secondSelection.caseId,
    runId: descriptor.runId,
    rng: deterministicNoShuffle
  });
  expect(secondOpened.status === 'created', `Free next-open returned ${secondOpened.status}.`);
  expect(secondOpened.review.systemId === SYSTEM_B, 'Free next-open was not concretely attributed to System B.');
  expect(secondOpened.review.selectedScope?.runScope?.systems?.length === 2, 'Free next-open lost the multi-System run scope.');
  descriptor = beginFreeWork(descriptor, secondSelection.caseId, secondOpened.review.id);
  const secondReveal = await revealActiveReview({ db, userId: FREE_USER, reviewId: secondOpened.review.id });
  expect(secondReveal?.revealedAt, 'Free second Review did not reveal.');
  const secondCompletion = await completeFreeReview({
    db,
    userId: FREE_USER,
    reviewId: secondOpened.review.id,
    now: startedAt + 1_000
  });
  expect(secondCompletion.status === 'completed', `Free second completion returned ${secondCompletion.status}.`);

  const residual = await env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM active_reviews WHERE user_id = ?) AS active_reviews,
      (SELECT count(*) FROM free_review_completion_receipts WHERE user_id = ?) AS receipts,
      (SELECT count(*) FROM scheduled_review_events WHERE user_id = ?) AS scheduled_events
  `).bind(FREE_USER, FREE_USER, FREE_USER).first();
  expect(Number(residual?.active_reviews) === 0, 'Free cross-navigation left an Active Review.');
  expect(Number(residual?.receipts) === 2, 'Free cross-navigation did not commit exactly two completion receipts.');
  expect(Number(residual?.scheduled_events) === 0, 'Free cross-navigation wrote Scheduled events.');

  return {
    first: { caseId: firstOpened.review.caseId, systemId: firstOpened.review.systemId },
    second: { caseId: secondOpened.review.caseId, systemId: secondOpened.review.systemId },
    secondOpenRunScopeSystems: secondOpened.review.selectedScope.runScope.systems.length,
    receipts: Number(residual.receipts)
  };
}

async function runAcceptance(env) {
  return {
    runtime: 'workerd + local D1 after all repository migrations',
    scheduled: await runScheduledCrossNavigation(env),
    free: await runFreeCrossNavigation(env)
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/acceptance') return new Response('not found', { status: 404 });
    try {
      return json(await runAcceptance(env));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }
};
