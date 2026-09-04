import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';

import { getBetterAuthBaseOptions, removeUserWithBetterAuth } from '../src/lib/server/auth-config.js';
import { createDb } from '../src/lib/server/db/index.js';
import {
  LEARNER_ACCOUNT_DELETION_BATCH_SIZE,
  advanceLearnerAccountDeletion,
  beginLearnerAccountDeletion
} from '../src/lib/server/db/learner-account-deletion.ts';

const DELETION_USER_ID = 'pr-g-deletion-user';
const ADMIN_EMAIL = 'pr-g-smoke-admin@example.test';
const ADMIN_PASSWORD = 'PrG-Smoke-Admin-Password-2026!';
const EXPECTED_TARGET_VERIFICATIONS = 2_500;
const EXPECTED_UNRELATED_VERIFICATIONS = 5_000;
const ANALYTICS_LEARNERS = 40;
const ANALYTICS_SYSTEMS = 10;
const ANALYTICS_MONTHS = 60;
const WRITE_COUNT = 2_000;

const MONTHLY_TRIGGER_SQL = `
CREATE TRIGGER scheduled_review_events_monthly_bucket_insert
AFTER INSERT ON scheduled_review_events
BEGIN
  INSERT INTO learner_system_monthly_buckets (
    user_id, system_id, month_start, scheduled_completed,
    scheduled_again, scheduled_hard, scheduled_good, scheduled_easy,
    first_completed_at, last_completed_at
  ) VALUES (
    NEW.user_id,
    NEW.system_id,
    cast(strftime('%s', NEW.completed_at / 1000, 'unixepoch', 'start of month') as integer) * 1000,
    1,
    CASE WHEN NEW.rating = 'again' THEN 1 ELSE 0 END,
    CASE WHEN NEW.rating = 'hard' THEN 1 ELSE 0 END,
    CASE WHEN NEW.rating = 'good' THEN 1 ELSE 0 END,
    CASE WHEN NEW.rating = 'easy' THEN 1 ELSE 0 END,
    NEW.completed_at,
    NEW.completed_at
  )
  ON CONFLICT(user_id, system_id, month_start) DO UPDATE SET
    scheduled_completed = learner_system_monthly_buckets.scheduled_completed + 1,
    scheduled_again = learner_system_monthly_buckets.scheduled_again + excluded.scheduled_again,
    scheduled_hard = learner_system_monthly_buckets.scheduled_hard + excluded.scheduled_hard,
    scheduled_good = learner_system_monthly_buckets.scheduled_good + excluded.scheduled_good,
    scheduled_easy = learner_system_monthly_buckets.scheduled_easy + excluded.scheduled_easy,
    first_completed_at = min(learner_system_monthly_buckets.first_completed_at, excluded.first_completed_at),
    last_completed_at = max(learner_system_monthly_buckets.last_completed_at, excluded.last_completed_at),
    updated_at = (unixepoch() * 1000);
END;
`;

function cookieHeaderFrom(headers) {
  const values = typeof headers?.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers?.get('set-cookie')].filter(Boolean);
  const pairs = [];
  for (const value of values) {
    for (const candidate of String(value).split(/,(?=[^;,]+=)/g)) {
      const pair = candidate.split(';', 1)[0]?.trim();
      if (pair) pairs.push(pair);
    }
  }
  if (!pairs.length) throw new Error('Better Auth admin bootstrap did not return a session cookie.');
  return pairs.join('; ');
}

async function createAdminHeaders(env) {
  const base = getBetterAuthBaseOptions(env);
  const bootstrapAuth = betterAuth({
    ...base,
    emailAndPassword: {
      ...base.emailAndPassword,
      disableSignUp: false
    },
    plugins: [admin()]
  });

  const signedUp = await bootstrapAuth.api.signUpEmail({
    returnHeaders: true,
    body: {
      name: 'PR G Smoke Admin',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    }
  });

  await env.DB.prepare(`UPDATE user SET role = 'admin' WHERE email = ?`).bind(ADMIN_EMAIL).run();
  return new Headers({ cookie: cookieHeaderFrom(signedUp.headers) });
}

async function count(env, sql, ...params) {
  const row = await env.DB.prepare(sql).bind(...params).first();
  return Number(row?.n ?? 0);
}

async function deletionProof(env) {
  const planResult = await env.DB.prepare(
    'EXPLAIN QUERY PLAN SELECT rowid FROM verification WHERE value = ? LIMIT 1000'
  ).bind(DELETION_USER_ID).all();
  const queryPlan = (planResult.results ?? []).map((row) => String(row.detail ?? '')).join(' | ');

  const adminHeaders = await createAdminHeaders(env);
  const db = createDb(env.DB);
  await beginLearnerAccountDeletion({ db, userId: DELETION_USER_ID });

  const verificationBatchRows = [];
  let readyForIdentityDelete = false;
  let finalPhase = null;
  for (let step = 0; step < 100 && !readyForIdentityDelete; step += 1) {
    const before = await env.DB.prepare(
      'SELECT phase FROM learner_account_deletions WHERE user_id = ? LIMIT 1'
    ).bind(DELETION_USER_ID).first();
    const result = await advanceLearnerAccountDeletion({
      db,
      userId: DELETION_USER_ID,
      batchSize: LEARNER_ACCOUNT_DELETION_BATCH_SIZE
    });
    if (before?.phase === 'auth_verifications') verificationBatchRows.push(result.rowsDeleted);
    readyForIdentityDelete = result.readyForIdentityDelete;
    finalPhase = result.phase;
  }
  if (!readyForIdentityDelete) throw new Error(`Deletion did not reach identity_ready; last phase=${finalPhase}`);

  const unrelatedBeforeIdentityDelete = await count(
    env,
    "SELECT COUNT(*) AS n FROM verification WHERE identifier LIKE 'unrelated:%'"
  );

  const productionLikeAuth = betterAuth({
    ...getBetterAuthBaseOptions(env),
    plugins: [admin()]
  });
  await removeUserWithBetterAuth(productionLikeAuth, {
    userId: DELETION_USER_ID,
    headers: adminHeaders
  });

  const residual = {
    user: await count(env, 'SELECT COUNT(*) AS n FROM user WHERE id = ?', DELETION_USER_ID),
    sessions: await count(env, 'SELECT COUNT(*) AS n FROM session WHERE userId = ?', DELETION_USER_ID),
    accounts: await count(env, 'SELECT COUNT(*) AS n FROM account WHERE userId = ?', DELETION_USER_ID),
    verifications: await count(env, 'SELECT COUNT(*) AS n FROM verification WHERE value = ?', DELETION_USER_ID),
    deletionMarker: await count(env, 'SELECT COUNT(*) AS n FROM learner_account_deletions WHERE user_id = ?', DELETION_USER_ID)
  };
  const unrelatedAfterIdentityDelete = await count(
    env,
    "SELECT COUNT(*) AS n FROM verification WHERE identifier LIKE 'unrelated:%'"
  );

  return {
    queryPlan,
    targetVerificationRows: EXPECTED_TARGET_VERIFICATIONS,
    unrelatedVerificationRows: EXPECTED_UNRELATED_VERIFICATIONS,
    verificationBatchRows,
    maxVerificationBatchRows: Math.max(0, ...verificationBatchRows),
    finalPhase,
    unrelatedBeforeIdentityDelete,
    unrelatedAfterIdentityDelete,
    residual
  };
}

function scheduledEventRows(prefix, count, completedAtBase) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const completedAt = completedAtBase + index * 1_000;
    const rating = ['again', 'hard', 'good', 'easy'][index % 4];
    rows.push(`(
      '${prefix}-${String(index).padStart(5, '0')}',
      'analytics-write-user',
      'analytics-write-case',
      'Analytics write benchmark case',
      'analytics-system-00',
      ${completedAt},
      '${rating}',
      'original',
      1, 1, ${index + 1}, 1, 1, '5.4.2', ${index + 1},
      ${completedAt + 86_400_000}, 'due', '${prefix}-run', 'benchmark-scope', ${completedAtBase}, 2
    )`);
  }
  return rows;
}

async function insertScheduledEvents(env, prefix, count) {
  const rows = scheduledEventRows(prefix, count, Date.UTC(2026, 7, 15, 12, 0, 0));
  for (let offset = 0; offset < rows.length; offset += 100) {
    const sql = `
      INSERT INTO scheduled_review_events (
        id, user_id, case_id, case_title_snapshot, system_id, completed_at,
        rating, content_mode, generation, review_sequence_epoch, sequence_no,
        parameter_revision, scheduler_revision, scheduler_library_version,
        resulting_state_revision, next_due_at, queue_class, run_id,
        scope_fingerprint, run_started_at, resulting_state
      ) VALUES ${rows.slice(offset, offset + 100).join(',')}
    `;
    await env.DB.prepare(sql).run();
  }
}

async function timed(operation) {
  const started = performance.now();
  const value = await operation();
  return { value, durationMs: +(performance.now() - started).toFixed(3) };
}

async function analyticsBenchmark(env) {
  await env.DB.exec('DROP TRIGGER IF EXISTS scheduled_review_events_monthly_bucket_insert;');
  await env.DB.prepare("DELETE FROM scheduled_review_events WHERE user_id = 'analytics-write-user'").run();
  await env.DB.prepare("DELETE FROM learner_system_monthly_buckets WHERE user_id = 'analytics-write-user'").run();

  const baselineWrite = await timed(() => insertScheduledEvents(env, 'baseline-event', WRITE_COUNT));
  await env.DB.prepare("DELETE FROM scheduled_review_events WHERE user_id = 'analytics-write-user'").run();

  await env.DB.exec(MONTHLY_TRIGGER_SQL);
  const bucketWrite = await timed(() => insertScheduledEvents(env, 'bucket-event', WRITE_COUNT));

  const writeBucket = await env.DB.prepare(`
    SELECT scheduled_completed, scheduled_again, scheduled_hard, scheduled_good, scheduled_easy
    FROM learner_system_monthly_buckets
    WHERE user_id = 'analytics-write-user'
      AND system_id = 'analytics-system-00'
    LIMIT 1
  `).first();

  // Keep the write-overhead fixture out of the long-running Admin read benchmark.
  await env.DB.prepare("DELETE FROM scheduled_review_events WHERE user_id = 'analytics-write-user'").run();
  await env.DB.prepare("DELETE FROM learner_system_monthly_buckets WHERE user_id = 'analytics-write-user'").run();

  const longRunningBucketRows = await count(
    env,
    "SELECT COUNT(*) AS n FROM learner_system_monthly_buckets WHERE user_id LIKE 'analytics-user-%'"
  );

  const systemAggregation = await timed(() => env.DB.prepare(`
    SELECT
      b.system_id,
      b.month_start,
      SUM(b.scheduled_completed) AS scheduled_completed,
      SUM(b.scheduled_again) AS scheduled_again,
      SUM(b.scheduled_hard) AS scheduled_hard,
      SUM(b.scheduled_good) AS scheduled_good,
      SUM(b.scheduled_easy) AS scheduled_easy,
      COUNT(DISTINCT b.user_id) AS active_learners
    FROM learner_system_monthly_buckets b
    GROUP BY b.system_id, b.month_start
    ORDER BY b.month_start, b.system_id
  `).all());

  const cohortAggregation = await timed(() => env.DB.prepare(`
    SELECT
      CASE
        WHEN typeof(u.createdAt) IN ('integer', 'real')
          THEN strftime('%Y-%m', CAST(u.createdAt AS integer) / 1000, 'unixepoch')
        ELSE strftime('%Y-%m', u.createdAt)
      END AS cohort_month,
      b.month_start,
      SUM(b.scheduled_completed) AS scheduled_completed,
      SUM(b.scheduled_again) AS scheduled_again,
      SUM(b.scheduled_hard) AS scheduled_hard,
      SUM(b.scheduled_good) AS scheduled_good,
      SUM(b.scheduled_easy) AS scheduled_easy,
      COUNT(DISTINCT b.user_id) AS active_learners
    FROM learner_system_monthly_buckets b
    INNER JOIN user u ON u.id = b.user_id
    WHERE u.role IS NULL OR u.role = 'user'
    GROUP BY cohort_month, b.month_start
    ORDER BY cohort_month, b.month_start
  `).all());

  const baselineMs = baselineWrite.durationMs;
  const bucketMs = bucketWrite.durationMs;
  return {
    scheduledWriteCount: WRITE_COUNT,
    baselineWriteMs: baselineMs,
    monthlyBucketWriteMs: bucketMs,
    monthlyBucketAddedMs: +(bucketMs - baselineMs).toFixed(3),
    monthlyBucketWriteRatio: baselineMs > 0 ? +(bucketMs / baselineMs).toFixed(3) : null,
    writeBucket,
    longRunningFixture: {
      learners: ANALYTICS_LEARNERS,
      systems: ANALYTICS_SYSTEMS,
      months: ANALYTICS_MONTHS,
      bucketRows: longRunningBucketRows
    },
    adminSystemAggregationMs: systemAggregation.durationMs,
    adminSystemSeriesRows: systemAggregation.value.results?.length ?? 0,
    adminCohortAggregationMs: cohortAggregation.durationMs,
    adminCohortSeriesRows: cohortAggregation.value.results?.length ?? 0
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/health') return Response.json({ ok: true });
      if (url.pathname === '/run') {
        const deletion = await deletionProof(env);
        const analytics = await analyticsBenchmark(env);
        return Response.json({ deletion, analytics });
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.stack ?? error.message : String(error) }, { status: 500 });
    }
  }
};
