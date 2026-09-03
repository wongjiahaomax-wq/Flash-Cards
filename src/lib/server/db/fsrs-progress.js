import { retainedDetailedHistorySql } from './fsrs-retention.js';

const DATABASE_NOW_MS_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_HISTORY_LIMIT = 20;

const ELIGIBLE_SYSTEM_CASES_CTE = `
WITH RECURSIVE primary_ancestry(case_id, concept_id, parent_id, kind) AS (
  SELECT c.id, topic.id, topic.parent_id, topic.kind
  FROM cases c
  INNER JOIN case_concepts cc
    ON cc.case_id = c.id AND cc.role = 'primary'
  INNER JOIN concepts topic
    ON topic.id = cc.concept_id
   AND topic.kind = 'topic'
   AND topic.is_active = 1
  WHERE c.is_active = 1
    AND c.preview_session_id IS NULL

  UNION ALL

  SELECT child.case_id, parent.id, parent.parent_id, parent.kind
  FROM primary_ancestry child
  INNER JOIN concepts parent
    ON parent.id = child.parent_id
   AND parent.is_active = 1
),
primary_system_cases AS (
  SELECT DISTINCT case_id, concept_id AS system_id
  FROM primary_ancestry
  WHERE kind = 'system'
),
eligible_cases AS (
  SELECT DISTINCT case_id
  FROM primary_system_cases
),
tag_system_cases AS (
  SELECT DISTINCT ec.case_id, st.system_concept_id AS system_id
  FROM eligible_cases ec
  INNER JOIN case_tags ct ON ct.case_id = ec.case_id
  INNER JOIN tags t ON t.id = ct.tag_id AND t.is_active = 1
  INNER JOIN system_tags st ON st.tag_id = ct.tag_id
  INNER JOIN concepts system
    ON system.id = st.system_concept_id
   AND system.kind = 'system'
   AND system.is_active = 1
),
eligible_system_cases AS (
  SELECT case_id, system_id FROM primary_system_cases
  UNION
  SELECT case_id, system_id FROM tag_system_cases
)
`;

/** @param {unknown} value @param {string} label */
function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}

/** @param {import('./index.js').LearningDb} db */
function requireD1Client(db) {
  const client = db.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('Learner FSRS Progress requires a Cloudflare D1 client with batch support.');
  }
  return client;
}

/** @param {unknown} result */
function rows(result) {
  return Array.isArray(/** @type {any} */ (result)?.results)
    ? /** @type {any[]} */ (/** @type {any} */ (result).results)
    : [];
}

/** @param {unknown} value */
function integer(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

/** @param {unknown} value */
function timestamp(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Learner-facing Progress deliberately reads compact current state/aggregates
 * plus the retained detailed-history window. It does not expose raw FSRS
 * stability/difficulty and does not compute PR-G cohort/admin analytics.
 *
 * @param {{db:import('./index.js').LearningDb,userId:string}} input
 */
export async function getLearnerFsrsProgress(input) {
  const userId = requiredString(input.userId, 'Learner');
  const client = requireD1Client(input.db);
  const retainedHistory = retainedDetailedHistorySql('e', 'p');

  const statements = [
    client.prepare(`
      ${ELIGIBLE_SYSTEM_CASES_CTE}
      SELECT
        (SELECT COUNT(*) FROM eligible_cases) AS eligible_cases,
        COALESCE(SUM(CASE WHEN state.case_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS entered_srs,
        COALESCE(SUM(CASE
          WHEN state.case_id IS NOT NULL AND state.due_at <= ${DATABASE_NOW_MS_SQL} THEN 1
          ELSE 0
        END), 0) AS due_cases,
        COALESCE(SUM(CASE
          WHEN state.case_id IS NOT NULL AND state.due_at > ${DATABASE_NOW_MS_SQL} THEN 1
          ELSE 0
        END), 0) AS not_due_cases
      FROM eligible_cases ec
      LEFT JOIN learner_fsrs_profiles p ON p.user_id = ?
      LEFT JOIN learner_case_fsrs state
        ON state.user_id = ?
       AND state.case_id = ec.case_id
       AND state.generation = p.generation
       AND state.review_sequence_epoch = p.review_sequence_epoch
       AND state.parameter_revision = p.parameter_revision
       AND state.scheduler_revision = p.scheduler_revision
       AND state.scheduler_library_version = p.scheduler_library_version
    `).bind(userId, userId),
    client.prepare(`
      SELECT
        COALESCE(a.scheduled_completed, 0) AS scheduled_completed,
        COALESCE(a.scheduled_again, 0) AS scheduled_again,
        COALESCE(a.scheduled_hard, 0) AS scheduled_hard,
        COALESCE(a.scheduled_good, 0) AS scheduled_good,
        COALESCE(a.scheduled_easy, 0) AS scheduled_easy,
        COALESCE(a.free_completed, 0) AS free_completed,
        a.first_activity_at,
        a.last_activity_at,
        (
          SELECT COUNT(*)
          FROM learner_case_encounters encounter
          WHERE encounter.user_id = identity.user_id
            AND encounter.first_scheduled_completed_at IS NOT NULL
        ) AS unique_scheduled_cases,
        (
          SELECT COUNT(*)
          FROM scheduled_review_events e
          INNER JOIN learner_fsrs_profiles p ON p.user_id = e.user_id
          WHERE e.user_id = identity.user_id
            AND e.completed_at >= ${DATABASE_NOW_MS_SQL} - ${THIRTY_DAYS_MS}
            AND ${retainedHistory}
        ) AS recent_scheduled_30d
      FROM (SELECT ? AS user_id) identity
      LEFT JOIN learner_aggregates a ON a.user_id = identity.user_id
    `).bind(userId),
    client.prepare(`
      ${ELIGIBLE_SYSTEM_CASES_CTE}
      SELECT
        system.id AS system_id,
        system.name AS system_name,
        COUNT(esc.case_id) AS eligible_cases,
        COALESCE(SUM(CASE WHEN state.case_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS entered_srs,
        COALESCE(SUM(CASE
          WHEN state.case_id IS NOT NULL AND state.due_at <= ${DATABASE_NOW_MS_SQL} THEN 1
          ELSE 0
        END), 0) AS due_cases,
        COALESCE(SUM(CASE
          WHEN state.case_id IS NOT NULL AND state.due_at > ${DATABASE_NOW_MS_SQL} THEN 1
          ELSE 0
        END), 0) AS not_due_cases,
        COALESCE(history.scheduled_completed, 0) AS scheduled_completed,
        COALESCE(history.scheduled_again, 0) AS scheduled_again,
        COALESCE(history.scheduled_hard, 0) AS scheduled_hard,
        COALESCE(history.scheduled_good, 0) AS scheduled_good,
        COALESCE(history.scheduled_easy, 0) AS scheduled_easy
      FROM eligible_system_cases esc
      INNER JOIN concepts system
        ON system.id = esc.system_id
       AND system.kind = 'system'
       AND system.is_active = 1
      LEFT JOIN learner_fsrs_profiles p ON p.user_id = ?
      LEFT JOIN learner_case_fsrs state
        ON state.user_id = ?
       AND state.case_id = esc.case_id
       AND state.generation = p.generation
       AND state.review_sequence_epoch = p.review_sequence_epoch
       AND state.parameter_revision = p.parameter_revision
       AND state.scheduler_revision = p.scheduler_revision
       AND state.scheduler_library_version = p.scheduler_library_version
      LEFT JOIN learner_system_aggregates history
        ON history.user_id = ? AND history.system_id = system.id
      GROUP BY
        system.id,
        system.name,
        history.scheduled_completed,
        history.scheduled_again,
        history.scheduled_hard,
        history.scheduled_good,
        history.scheduled_easy
      ORDER BY system.name, system.id
    `).bind(userId, userId, userId),
    client.prepare(`
      SELECT
        generation,
        review_sequence_epoch,
        parameter_revision,
        detailed_history_retention
      FROM learner_fsrs_profiles
      WHERE user_id = ?
      LIMIT 1
    `).bind(userId),
    client.prepare(`
      SELECT
        e.id,
        e.case_id,
        e.case_title_snapshot,
        e.system_id,
        system.name AS system_name,
        e.completed_at,
        e.rating,
        e.content_mode,
        e.generation,
        e.review_sequence_epoch
      FROM scheduled_review_events e
      INNER JOIN learner_fsrs_profiles p ON p.user_id = e.user_id
      LEFT JOIN concepts system ON system.id = e.system_id
      WHERE e.user_id = ?
        AND ${retainedHistory}
      ORDER BY e.completed_at DESC, e.id DESC
      LIMIT ${RECENT_HISTORY_LIMIT}
    `).bind(userId)
  ];

  const result = await client.batch(statements);
  const overview = rows(result[0])[0] ?? {};
  const aggregate = rows(result[1])[0] ?? {};
  const systemRows = rows(result[2]);
  const profile = rows(result[3])[0] ?? null;
  const historyRows = rows(result[4]);

  return {
    profile: profile ? {
      generation: integer(profile.generation),
      reviewSequenceEpoch: integer(profile.review_sequence_epoch),
      parameterRevision: integer(profile.parameter_revision),
      detailedHistoryRetention: String(profile.detailed_history_retention)
    } : null,
    coverage: {
      enteredSrs: integer(overview.entered_srs),
      eligibleCases: integer(overview.eligible_cases)
    },
    memory: {
      due: integer(overview.due_cases),
      notDue: integer(overview.not_due_cases)
    },
    activity: {
      scheduledCompleted: integer(aggregate.scheduled_completed),
      recentScheduled30d: integer(aggregate.recent_scheduled_30d),
      uniqueScheduledCases: integer(aggregate.unique_scheduled_cases),
      freeCompleted: integer(aggregate.free_completed),
      firstActivityAt: timestamp(aggregate.first_activity_at),
      lastActivityAt: timestamp(aggregate.last_activity_at)
    },
    ratings: {
      again: integer(aggregate.scheduled_again),
      hard: integer(aggregate.scheduled_hard),
      good: integer(aggregate.scheduled_good),
      easy: integer(aggregate.scheduled_easy)
    },
    systems: systemRows.map((row) => ({
      systemId: String(row.system_id),
      systemName: String(row.system_name),
      eligibleCases: integer(row.eligible_cases),
      enteredSrs: integer(row.entered_srs),
      due: integer(row.due_cases),
      notDue: integer(row.not_due_cases),
      scheduledCompleted: integer(row.scheduled_completed),
      ratings: {
        again: integer(row.scheduled_again),
        hard: integer(row.scheduled_hard),
        good: integer(row.scheduled_good),
        easy: integer(row.scheduled_easy)
      }
    })),
    recentHistory: historyRows.map((row) => ({
      id: String(row.id),
      caseId: String(row.case_id),
      caseTitle: String(row.case_title_snapshot),
      systemId: String(row.system_id),
      systemName: row.system_name == null ? 'Historical System' : String(row.system_name),
      completedAt: integer(row.completed_at),
      rating: String(row.rating),
      contentMode: String(row.content_mode),
      generation: integer(row.generation),
      reviewSequenceEpoch: integer(row.review_sequence_epoch)
    }))
  };
}
