import { createDb } from '../src/lib/server/db/index.js';
import {
  advanceLearnerAccountDeletion,
  beginLearnerAccountDeletion
} from '../src/lib/server/db/learner-account-deletion.ts';
import {
  advanceStudyDataDeletion,
  beginStudyDataDeletion,
  STUDY_DATA_DELETION_BATCH_SIZE
} from '../src/lib/server/db/learner-study-data-deletion.ts';

const USER_ID = 'd1-deletion-user';

async function count(env, table, column = 'user_id') {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
    .bind(USER_ID)
    .first();
  return Number(row?.n ?? 0);
}

async function countLegacyReviewChildren(env, table) {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM ${table}
    WHERE review_id IN (SELECT id FROM reviews WHERE user_id = ?)
  `).bind(USER_ID).first();
  return Number(row?.n ?? 0);
}

async function status(env) {
  const user = await env.DB.prepare(`
    SELECT id, banned FROM user WHERE id = ? LIMIT 1
  `).bind(USER_ID).first();
  const deletion = await env.DB.prepare(`
    SELECT phase, batches_completed FROM learner_account_deletions WHERE user_id = ? LIMIT 1
  `).bind(USER_ID).first();
  return {
    userExists: Boolean(user),
    banned: Boolean(Number(user?.banned ?? 0)),
    phase: deletion?.phase ?? null,
    batchesCompleted: Number(deletion?.batches_completed ?? 0),
    sessions: await count(env, 'session', 'userId'),
    accounts: await count(env, 'account', 'userId'),
    verifications: await count(env, 'verification', 'value'),
    freeReceipts: await count(env, 'free_review_completion_receipts'),
    scheduledEvents: await count(env, 'scheduled_review_events'),
    activeReviews: await count(env, 'active_reviews'),
    optimizerEvidence: await count(env, 'learner_optimizer_evidence'),
    caseState: await count(env, 'learner_case_fsrs'),
    encounters: await count(env, 'learner_case_encounters'),
    monthlyBuckets: await count(env, 'learner_system_monthly_buckets'),
    systemAggregates: await count(env, 'learner_system_aggregates'),
    learnerAggregates: await count(env, 'learner_aggregates'),
    preferences: await count(env, 'learner_preferences'),
    profiles: await count(env, 'learner_fsrs_profiles'),
    legacyReviews: await count(env, 'reviews'),
    legacyReviewQuestions: await countLegacyReviewChildren(env, 'review_questions'),
    legacyReviewAssets: await countLegacyReviewChildren(env, 'review_assets'),
    studyDeletion: await env.DB.prepare(`
      SELECT phase, batches_completed FROM learner_study_data_deletions WHERE user_id = ? LIMIT 1
    `).bind(USER_ID).first()
  };
}

async function insertFreshActiveReview(env, id) {
  await env.DB.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, run_id,
      scope_fingerprint, scope_json, case_title_snapshot, revealed_at, expires_at
    ) VALUES (?, ?, 'case-00000', 'system-0', 'free', 'original', 'fresh-run',
      'fresh-scope', '{"systemId":"system-0","routes":[]}', 'Fresh Case', ?, ?)
  `).bind(id, USER_ID, Date.now(), Date.now() + 86_400_000).run();
}

async function studyDataDeletionProof(env) {
  const db = createDb(env.DB);
  const before = await status(env);
  const started = await beginStudyDataDeletion({ db, userId: USER_ID });

  const blockedWriter = await env.DB.prepare(`
    INSERT INTO scheduled_review_events (
      id, user_id, case_id, case_title_snapshot, system_id, completed_at,
      rating, content_mode, generation, review_sequence_epoch, sequence_no,
      parameter_revision, scheduler_revision, scheduler_library_version,
      resulting_state_revision, next_due_at, queue_class, run_id,
      scope_fingerprint, run_started_at, resulting_state
    ) VALUES (?, ?, 'case-00000', 'Blocked Case', 'system-0', ?, 'good', 'original',
      1, 1, 999999, 1, 1, '5.4.2', 1, ?, 'due', 'blocked-run', 'blocked-scope', ?, 2)
  `).bind('blocked-during-study-delete', USER_ID, Date.now(), Date.now() + 86_400_000, Date.now()).run()
    .then(() => ({ blocked: false }))
    .catch((error) => ({
      blocked: String(error?.message ?? error).includes('learner_study_data_deletion_in_progress')
    }));

  const steps = [];
  let latest = null;
  for (let attempt = 0; attempt < 100 && !latest?.complete; attempt += 1) {
    const result = await advanceStudyDataDeletion({
      db,
      userId: USER_ID,
      batchSize: STUDY_DATA_DELETION_BATCH_SIZE
    });
    steps.push({ phase: result.phase, rowsDeleted: result.rowsDeleted });
    if (result.rowsDeleted > STUDY_DATA_DELETION_BATCH_SIZE) {
      throw new Error('D1 study-data deletion exceeded its batch bound.');
    }
    latest = result;
  }
  if (!latest?.complete) throw new Error(`Study-data deletion did not complete; phase=${latest?.phase}`);

  const completed = await status(env);
  if (!started.inProgress) throw new Error('Study-data deletion did not start in a fencing state.');
  if (!blockedWriter.blocked) throw new Error('Migrated D1 accepted a study writer while fenced.');
  if (!completed.userExists) throw new Error('Self-wipe removed the authentication identity.');
  if (completed.preferences !== 1) throw new Error('Self-wipe removed unrelated learner preferences.');
  for (const field of [
    'freeReceipts', 'scheduledEvents', 'activeReviews', 'optimizerEvidence',
    'caseState', 'encounters', 'monthlyBuckets', 'systemAggregates',
    'learnerAggregates', 'profiles', 'legacyReviews', 'legacyReviewQuestions',
    'legacyReviewAssets'
  ]) {
    if (completed[field] !== 0) throw new Error(`Self-wipe left ${field} rows behind.`);
  }
  if (completed.studyDeletion?.phase !== 'complete') throw new Error('Self-wipe completed without a non-fencing marker.');

  await insertFreshActiveReview(env, 'fresh-after-study-delete');
  const fresh = await status(env);
  if (fresh.activeReviews !== 1) throw new Error('A completed marker did not permit fresh study state.');

  await beginStudyDataDeletion({ db, userId: USER_ID });
  const restarted = await advanceStudyDataDeletion({ db, userId: USER_ID, batchSize: 1 });
  if (restarted.rowsDeleted !== 1) throw new Error('The repeat wipe did not remove later study activity.');
  await beginLearnerAccountDeletion({ db, userId: USER_ID });
  try {
    await advanceStudyDataDeletion({ db, userId: USER_ID });
    throw new Error('Self-wipe advanced after permanent account deletion took over.');
  } catch (error) {
    if (error?.code !== 'account-deletion-in-progress') throw error;
  }

  return {
    initial: {
      scheduledEvents: before.scheduledEvents,
      freeReceipts: before.freeReceipts,
      caseState: before.caseState,
      monthlyBuckets: before.monthlyBuckets,
      legacyReviews: before.legacyReviews
    },
    steps,
    maximumRowsDeletedPerStep: Math.max(0, ...steps.map((step) => step.rowsDeleted)),
    completed,
    freshStudyAllowed: fresh.activeReviews === 1,
    accountDeletionTookOver: true
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const db = createDb(env.DB);
    try {
      if (url.pathname === '/status') {
        return Response.json(await status(env));
      }
      if (url.pathname === '/direct-delete') {
        try {
          await env.DB.prepare('DELETE FROM user WHERE id = ?').bind(USER_ID).run();
          return Response.json({ blocked: false });
        } catch (error) {
          return Response.json({ blocked: String(error?.message ?? error).includes('learner_account_requires_staged_deletion') });
        }
      }
      if (url.pathname === '/study-proof') {
        return Response.json(await studyDataDeletionProof(env));
      }
      if (url.pathname === '/begin') {
        const result = await beginLearnerAccountDeletion({ db, userId: USER_ID });
        return Response.json({ result, status: await status(env) });
      }
      if (url.pathname === '/advance') {
        const result = await advanceLearnerAccountDeletion({ db, userId: USER_ID });
        return Response.json({ result, status: await status(env) });
      }
      if (url.pathname === '/identity-delete') {
        await env.DB.prepare('DELETE FROM user WHERE id = ?').bind(USER_ID).run();
        return Response.json(await status(env));
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }
};
