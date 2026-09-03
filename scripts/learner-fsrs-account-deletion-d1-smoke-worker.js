import { createDb } from '../src/lib/server/db/index.js';
import {
  advanceLearnerAccountDeletion,
  beginLearnerAccountDeletion
} from '../src/lib/server/db/learner-account-deletion.ts';

const USER_ID = 'd1-deletion-user';

async function count(env, table, column = 'user_id') {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`)
    .bind(USER_ID)
    .first();
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
    profiles: await count(env, 'learner_fsrs_profiles')
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
