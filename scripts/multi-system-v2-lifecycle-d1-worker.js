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

const PROOF_SECRET = 'multi-system-v2-lifecycle-d1-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const SYSTEM_A = 'multi-v2-system-a';
const SYSTEM_B = 'multi-v2-system-b';
const TOPIC_B = 'multi-v2-topic-b';
const CROSS_TAG = 'multi-v2-cross-tag';
const CROSS_CASE = 'multi-v2-cross-case';
const SCHEDULED_USER = 'multi-v2-scheduled-user';
const FREE_USER = 'multi-v2-free-user';
const INVALID_USER = 'multi-v2-invalid-user';
const BENCHMARK_USER = 'multi-v2-trigger-benchmark-user';
const BENCHMARK_CASE = 'multi-v2-trigger-benchmark-case';
const BENCHMARK_SYSTEMS = 64;
const BENCHMARK_ROUTES_PER_SYSTEM = 8;
const BENCHMARK_ITERATIONS = 12;
const BENCHMARK_WARMUPS = 2;
const MAX_TRIGGER_P95_MS = 750;
const MAX_TRIGGER_SINGLE_MS = 1500;

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

async function first(binding, sql, binds = []) {
  return binding.prepare(sql).bind(...binds).first();
}

function mixedSystems() {
  return [
    {
      systemId: SYSTEM_A,
      mode: 'routes',
      routes: [{ routeType: 'tag', routeId: CROSS_TAG }]
    },
    { systemId: SYSTEM_B, mode: 'all' }
  ];
}

function requireOwnedDescriptor(descriptor, userId) {
  const ownership = validateLearnerStudyRunOwner(descriptor, userId);
  if (!ownership.ok) throw new Error(`Descriptor ownership validation failed: ${ownership.message}`);
  return ownership.descriptor;
}

async function runScheduledLifecycle(env) {
  const db = createDb(env.DB);
  const startedAt = Date.now() - 2_000;
  const descriptor = requireOwnedDescriptor(await planScheduledMultiSystemStudyRun({
    db,
    userId: SCHEDULED_USER,
    systems: mixedSystems(),
    proofSecret: PROOF_SECRET,
    now: startedAt,
    rng: () => 0.5,
    runId: 'multi-v2-scheduled-run'
  }), SCHEDULED_USER);

  expect(descriptor.version === 2 && descriptor.kind === 'scheduled', 'Scheduled planner did not emit descriptor v2.');
  const work = descriptor.capturedNew.find((entry) => entry.caseId === CROSS_CASE);
  expect(work, 'Scheduled mixed-System planner did not capture the cross-System Case as New.');
  const workProof = descriptor.membershipProofs.new[work.proofIndex];
  expect(typeof workProof === 'string' && workProof.length > 0, 'Scheduled mixed-System work proof is missing.');

  const opened = await createScheduledActiveReview({
    db,
    userId: SCHEDULED_USER,
    runScope: descriptor.selectedScope,
    caseId: CROSS_CASE,
    queueClass: 'new',
    runBoundaryToken: descriptor.runBoundaryToken,
    workProof,
    proofSecret: PROOF_SECRET,
    now: startedAt + 500,
    rng: () => 0.5
  });
  expect(opened.status === 'created', `Scheduled open returned ${opened.status}.`);
  expect(opened.review.systemId === SYSTEM_B, 'Scheduled concrete attribution did not prefer the native Primary-Topic System.');
  expect(opened.review.selectedScope?.version === 2, 'Scheduled Active Review did not persist the v2 scope envelope.');
  expect(opened.review.selectedScope?.systemId === SYSTEM_B, 'Persisted Scheduled attribution System is wrong.');
  expect(opened.review.selectedScope?.runScope?.systems?.length === 2, 'Persisted Scheduled runScope lost a selected System.');

  const revealed = await revealActiveReview({ db, userId: SCHEDULED_USER, reviewId: opened.review.id });
  expect(revealed?.revealedAt, 'Scheduled reveal did not persist.');

  const completionInput = {
    db,
    userId: SCHEDULED_USER,
    reviewId: opened.review.id,
    rating: /** @type {const} */ ('good'),
    runBoundaryToken: descriptor.runBoundaryToken,
    proofSecret: PROOF_SECRET,
    now: startedAt + 1_000
  };
  const completed = await completeScheduledReview(completionInput);
  const replayed = await completeScheduledReview(completionInput);
  expect(completed.status === 'completed', `Scheduled completion returned ${completed.status}.`);
  expect(replayed.status === 'replayed', `Scheduled lost-response retry returned ${replayed.status}.`);
  expect(replayed.eventId === completed.eventId, 'Scheduled replay did not reconcile to the same durable event.');

  const event = await first(env.DB, `
    SELECT system_id, rating, queue_class, count(*) OVER () AS row_count
    FROM scheduled_review_events
    WHERE user_id = ?
  `, [SCHEDULED_USER]);
  const systemAggregate = await first(env.DB, `
    SELECT system_id, scheduled_completed, scheduled_good
    FROM learner_system_aggregates
    WHERE user_id = ?
  `, [SCHEDULED_USER]);
  const monthly = await first(env.DB, `
    SELECT system_id, scheduled_completed, scheduled_good, month_start
    FROM learner_system_monthly_buckets
    WHERE user_id = ?
  `, [SCHEDULED_USER]);
  const learnerAggregate = await first(env.DB, `
    SELECT scheduled_completed, scheduled_good
    FROM learner_aggregates
    WHERE user_id = ?
  `, [SCHEDULED_USER]);
  const residual = await first(env.DB, `
    SELECT
      (SELECT count(*) FROM active_reviews WHERE user_id = ?) AS active_reviews,
      (SELECT count(*) FROM scheduled_review_events WHERE user_id = ?) AS events,
      (SELECT count(*) FROM learner_optimizer_evidence WHERE user_id = ?) AS optimizer_evidence,
      (SELECT count(*) FROM learner_case_fsrs WHERE user_id = ? AND case_id = ?) AS case_states
  `, [SCHEDULED_USER, SCHEDULED_USER, SCHEDULED_USER, SCHEDULED_USER, CROSS_CASE]);

  expect(event?.system_id === SYSTEM_B && event?.rating === 'good' && event?.queue_class === 'new', 'Scheduled event provenance is incorrect.');
  expect(Number(event?.row_count) === 1, 'Scheduled exactly-once retry created duplicate events.');
  expect(systemAggregate?.system_id === SYSTEM_B && Number(systemAggregate?.scheduled_completed) === 1 && Number(systemAggregate?.scheduled_good) === 1, 'Scheduled System aggregate provenance is incorrect.');
  expect(monthly?.system_id === SYSTEM_B && Number(monthly?.scheduled_completed) === 1 && Number(monthly?.scheduled_good) === 1, 'Scheduled monthly provenance is incorrect.');
  expect(Number(learnerAggregate?.scheduled_completed) === 1 && Number(learnerAggregate?.scheduled_good) === 1, 'Scheduled learner aggregate is incorrect.');
  expect(Number(residual?.active_reviews) === 0 && Number(residual?.events) === 1 && Number(residual?.optimizer_evidence) === 1 && Number(residual?.case_states) === 1, 'Scheduled lifecycle left incoherent durable state.');

  return {
    descriptorVersion: descriptor.version,
    selectedSystems: descriptor.selectedScope.systems.length,
    activeReviewSystemId: opened.review.systemId,
    completionStatus: completed.status,
    replayStatus: replayed.status,
    eventSystemId: event.system_id,
    systemAggregate,
    monthly,
    learnerAggregate,
    residual
  };
}

async function runFreeLifecycle(env) {
  const db = createDb(env.DB);
  const startedAt = Date.now() - 2_000;
  const descriptor = requireOwnedDescriptor(await planFreeMultiSystemStudyRun({
    db,
    userId: FREE_USER,
    systems: mixedSystems(),
    now: startedAt,
    rng: () => 0.5,
    runId: 'multi-v2-free-run'
  }), FREE_USER);

  expect(descriptor.version === 2 && descriptor.kind === 'free', 'Free planner did not emit descriptor v2.');
  expect(descriptor.bag.includes(CROSS_CASE), 'Free mixed-System planner did not include the cross-System Case.');
  const opened = await createFreeActiveReview({
    db,
    userId: FREE_USER,
    runScope: descriptor.selectedScope,
    caseId: CROSS_CASE,
    runId: descriptor.runId,
    rng: () => 0.5
  });
  expect(opened.status === 'created', `Free open returned ${opened.status}.`);
  expect(opened.review.systemId === SYSTEM_B, 'Free concrete attribution did not prefer the native Primary-Topic System.');
  expect(opened.review.selectedScope?.version === 2 && opened.review.selectedScope?.systemId === SYSTEM_B, 'Free Active Review did not persist the v2 attribution envelope.');

  const revealed = await revealActiveReview({ db, userId: FREE_USER, reviewId: opened.review.id });
  expect(revealed?.revealedAt, 'Free reveal did not persist.');
  const completionInput = { db, userId: FREE_USER, reviewId: opened.review.id, now: startedAt + 1_000 };
  const completed = await completeFreeReview(completionInput);
  const replayed = await completeFreeReview(completionInput);
  expect(completed.status === 'completed', `Free completion returned ${completed.status}.`);
  expect(replayed.status === 'replayed', `Free lost-response retry returned ${replayed.status}.`);
  expect(replayed.receiptId === completed.receiptId, 'Free replay did not reconcile to the same receipt.');

  const state = await first(env.DB, `
    SELECT
      (SELECT count(*) FROM free_review_completion_receipts WHERE user_id = ?) AS receipts,
      (SELECT count(*) FROM active_reviews WHERE user_id = ?) AS active_reviews,
      (SELECT count(*) FROM scheduled_review_events WHERE user_id = ?) AS scheduled_events,
      (SELECT count(*) FROM learner_system_aggregates WHERE user_id = ?) AS system_aggregates,
      (SELECT count(*) FROM learner_system_monthly_buckets WHERE user_id = ?) AS monthly_buckets,
      (SELECT count(*) FROM learner_fsrs_profiles WHERE user_id = ?) AS fsrs_profiles,
      coalesce((SELECT free_times_studied FROM learner_case_encounters WHERE user_id = ? AND case_id = ?), 0) AS free_times_studied,
      coalesce((SELECT free_completed FROM learner_aggregates WHERE user_id = ?), 0) AS free_completed
  `, [FREE_USER, FREE_USER, FREE_USER, FREE_USER, FREE_USER, FREE_USER, FREE_USER, CROSS_CASE, FREE_USER]);

  expect(Number(state?.receipts) === 1, 'Free exactly-once retry created duplicate receipts.');
  expect(Number(state?.active_reviews) === 0, 'Free completion left an Active Review.');
  expect(Number(state?.scheduled_events) === 0 && Number(state?.system_aggregates) === 0 && Number(state?.monthly_buckets) === 0 && Number(state?.fsrs_profiles) === 0, 'Free lifecycle wrote Scheduled/FSRS provenance.');
  expect(Number(state?.free_times_studied) === 1 && Number(state?.free_completed) === 1, 'Free durable encounter/aggregate counts are incorrect.');

  return {
    descriptorVersion: descriptor.version,
    selectedSystems: descriptor.selectedScope.systems.length,
    activeReviewSystemId: opened.review.systemId,
    completionStatus: completed.status,
    replayStatus: replayed.status,
    state
  };
}

async function assertInvalidScopeRejected(env) {
  const db = createDb(env.DB);
  let rejected = null;
  try {
    await createFreeActiveReview({
      db,
      userId: INVALID_USER,
      runScope: {
        systems: [{
          systemId: SYSTEM_A,
          mode: 'routes',
          routes: [{ routeType: 'topic', routeId: TOPIC_B }]
        }]
      },
      caseId: CROSS_CASE,
      runId: 'multi-v2-invalid-run'
    });
  } catch (error) {
    rejected = error instanceof Error ? { name: error.name, message: error.message, code: error.code ?? null } : { name: 'Error', message: String(error), code: null };
  }
  expect(rejected, 'Invalid cross-System Topic scope unexpectedly opened an Active Review.');
  const residual = await first(env.DB, 'SELECT count(*) AS count FROM active_reviews WHERE user_id = ?', [INVALID_USER]);
  expect(Number(residual?.count) === 0, 'Rejected invalid scope left an Active Review row.');
  return rejected;
}

async function runLifecycleAcceptance(env) {
  return {
    runtime: 'workerd + local D1 after all repository migrations',
    scheduled: await runScheduledLifecycle(env),
    free: await runFreeLifecycle(env),
    invalidScope: await assertInvalidScopeRejected(env)
  };
}

function benchmarkSystemId(index) {
  return `multi-v2-bench-system-${String(index).padStart(3, '0')}`;
}
function benchmarkTopicId(systemIndex, topicIndex) {
  return `multi-v2-bench-topic-${String(systemIndex).padStart(3, '0')}-${String(topicIndex).padStart(2, '0')}`;
}
function largeRoutesRunScope() {
  return {
    systems: Array.from({ length: BENCHMARK_SYSTEMS }, (_, systemIndex) => ({
      systemId: benchmarkSystemId(systemIndex),
      mode: 'routes',
      routes: Array.from({ length: BENCHMARK_ROUTES_PER_SYSTEM }, (_, topicIndex) => ({
        routeType: 'topic',
        routeId: benchmarkTopicId(systemIndex, topicIndex)
      }))
    }))
  };
}
function allRunScope() {
  return {
    systems: Array.from({ length: BENCHMARK_SYSTEMS }, (_, systemIndex) => ({
      systemId: benchmarkSystemId(systemIndex),
      mode: 'all'
    }))
  };
}
function percentile95(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

async function measureTriggerScope(binding, label, runScope) {
  const scopeJson = JSON.stringify({ version: 2, systemId: benchmarkSystemId(0), runScope });
  const samples = [];
  const total = BENCHMARK_WARMUPS + BENCHMARK_ITERATIONS;
  for (let index = 0; index < total; index += 1) {
    const reviewId = `multi-v2-trigger-${label}-${index}`;
    const started = performance.now();
    await binding.prepare(`
      INSERT INTO active_reviews (
        id, user_id, case_id, system_id, study_mode, content_mode,
        run_id, scope_fingerprint, scope_json, case_title_snapshot
      ) VALUES (?, ?, ?, ?, 'free', 'original', ?, ?, ?, ?)
    `).bind(
      reviewId,
      BENCHMARK_USER,
      BENCHMARK_CASE,
      benchmarkSystemId(0),
      `run-${reviewId}`,
      `fp-${reviewId}`,
      scopeJson,
      'Multi-System v2 trigger benchmark Case'
    ).run();
    const elapsed = performance.now() - started;
    await binding.prepare('DELETE FROM active_reviews WHERE id = ?').bind(reviewId).run();
    if (index >= BENCHMARK_WARMUPS) samples.push(elapsed);
  }
  const result = {
    iterations: samples.length,
    medianMs: Number([...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)].toFixed(2)),
    p95Ms: Number(percentile95(samples).toFixed(2)),
    maxMs: Number(Math.max(...samples).toFixed(2))
  };
  expect(result.p95Ms < MAX_TRIGGER_P95_MS, `${label} v2 D1 trigger p95 exceeded ${MAX_TRIGGER_P95_MS}ms.`);
  expect(result.maxMs < MAX_TRIGGER_SINGLE_MS, `${label} v2 D1 trigger single insert exceeded ${MAX_TRIGGER_SINGLE_MS}ms.`);
  return result;
}

async function runTriggerBenchmark(env) {
  const largeRoutes = largeRoutesRunScope();
  const all = allRunScope();
  const largeRouteCount = largeRoutes.systems.reduce((total, system) => total + system.routes.length, 0);
  expect(largeRoutes.systems.length === 64 && largeRouteCount === 512, 'D1 trigger benchmark did not construct the supported 64-System / 512-route envelope.');
  return {
    runtime: 'workerd + local D1 after all repository migrations',
    envelope: { systems: largeRoutes.systems.length, routes: largeRouteCount },
    largeRoutes: await measureTriggerScope(env.DB, 'routes', largeRoutes),
    allSystems: await measureTriggerScope(env.DB, 'all', all),
    limits: { p95Ms: MAX_TRIGGER_P95_MS, singleInsertMs: MAX_TRIGGER_SINGLE_MS }
  };
}

export default {
  async fetch(request, env) {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/acceptance') return json(await runLifecycleAcceptance(env));
      if (pathname === '/benchmark') return json(await runTriggerBenchmark(env));
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return new Response(error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error), { status: 500 });
    }
  }
};
