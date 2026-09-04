const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 500;

export class LearnerAnalyticsError extends Error {
  code: 'invalid-input' | 'learner-not-found';

  constructor(code: LearnerAnalyticsError['code'], message: string) {
    super(message);
    this.name = 'LearnerAnalyticsError';
    this.code = code;
  }
}

function requiredString(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new LearnerAnalyticsError('invalid-input', `${label} is required.`);
  return normalized;
}

function requireD1Client(db: import('./index.js').LearningDb): D1Database {
  const client = db.$client;
  if (!client || typeof client.prepare !== 'function') {
    throw new Error('Learner analytics requires a Cloudflare D1 client.');
  }
  return client;
}

function rows(result: D1Result): Record<string, unknown>[] {
  return Array.isArray(result?.results) ? result.results as Record<string, unknown>[] : [];
}

function monthLabel(monthStart: unknown): string {
  const value = Number(monthStart);
  if (!Number.isFinite(value)) return '';
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ratingShape(row: Record<string, unknown>) {
  return {
    scheduledCompleted: Number(row.scheduled_completed ?? 0),
    again: Number(row.scheduled_again ?? 0),
    hard: Number(row.scheduled_hard ?? 0),
    good: Number(row.scheduled_good ?? 0),
    easy: Number(row.scheduled_easy ?? 0)
  };
}

/** Compact learner list. No detailed-history scan is required for this surface. */
export async function listLearnerAnalyticsOverview(db: import('./index.js').LearningDb) {
  const client = requireD1Client(db);
  const result = await client.prepare(`
    SELECT
      u.id AS user_id,
      u.name,
      u.email,
      u.createdAt AS account_created_at,
      COALESCE(p.detailed_history_retention, '24m') AS detailed_history_retention,
      COALESCE(a.scheduled_completed, 0) AS scheduled_completed,
      COALESCE(a.scheduled_again, 0) AS scheduled_again,
      COALESCE(a.scheduled_hard, 0) AS scheduled_hard,
      COALESCE(a.scheduled_good, 0) AS scheduled_good,
      COALESCE(a.scheduled_easy, 0) AS scheduled_easy,
      COALESCE(a.free_completed, 0) AS free_completed,
      a.first_activity_at,
      a.last_activity_at,
      d.phase AS deletion_phase
    FROM user u
    LEFT JOIN learner_fsrs_profiles p ON p.user_id = u.id
    LEFT JOIN learner_aggregates a ON a.user_id = u.id
    LEFT JOIN learner_account_deletions d ON d.user_id = u.id
    WHERE u.role IS NULL OR u.role = 'user'
    ORDER BY lower(u.name), lower(u.email), u.id
  `).all();

  return rows(result).map((row) => ({
    userId: String(row.user_id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    accountCreatedAt: Number(row.account_created_at ?? 0),
    detailedHistoryRetention: String(row.detailed_history_retention),
    ...ratingShape(row),
    freeCompleted: Number(row.free_completed ?? 0),
    firstActivityAt: row.first_activity_at == null ? null : Number(row.first_activity_at),
    lastActivityAt: row.last_activity_at == null ? null : Number(row.last_activity_at),
    deletionPhase: row.deletion_phase == null ? null : String(row.deletion_phase)
  }));
}

export async function getLearnerAnalyticsDetail(
  db: import('./index.js').LearningDb,
  userIdInput: string,
  options: { historyLimit?: number } = {}
) {
  const userId = requiredString(userIdInput, 'Learner');
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > MAX_HISTORY_LIMIT) {
    throw new LearnerAnalyticsError('invalid-input', `History limit must be between 1 and ${MAX_HISTORY_LIMIT}.`);
  }
  const client = requireD1Client(db);

  const learner = await client.prepare(`
    SELECT
      u.id AS user_id,
      u.name,
      u.email,
      u.createdAt AS account_created_at,
      COALESCE(p.detailed_history_retention, '24m') AS detailed_history_retention,
      COALESCE(a.scheduled_completed, 0) AS scheduled_completed,
      COALESCE(a.scheduled_again, 0) AS scheduled_again,
      COALESCE(a.scheduled_hard, 0) AS scheduled_hard,
      COALESCE(a.scheduled_good, 0) AS scheduled_good,
      COALESCE(a.scheduled_easy, 0) AS scheduled_easy,
      COALESCE(a.free_completed, 0) AS free_completed,
      a.first_activity_at,
      a.last_activity_at,
      d.phase AS deletion_phase
    FROM user u
    LEFT JOIN learner_fsrs_profiles p ON p.user_id = u.id
    LEFT JOIN learner_aggregates a ON a.user_id = u.id
    LEFT JOIN learner_account_deletions d ON d.user_id = u.id
    WHERE u.id = ? AND (u.role IS NULL OR u.role = 'user')
    LIMIT 1
  `).bind(userId).first<Record<string, unknown>>();
  if (!learner) throw new LearnerAnalyticsError('learner-not-found', 'The selected learner account no longer exists.');

  const [systemLifetimeResult, historyResult, monthlyResult] = await Promise.all([
    client.prepare(`
      SELECT
        a.system_id,
        COALESCE(c.name, a.system_id) AS system_name,
        a.scheduled_completed,
        a.scheduled_again,
        a.scheduled_hard,
        a.scheduled_good,
        a.scheduled_easy,
        a.first_completed_at,
        a.last_completed_at
      FROM learner_system_aggregates a
      LEFT JOIN concepts c ON c.id = a.system_id AND c.kind = 'system'
      WHERE a.user_id = ?
      ORDER BY lower(COALESCE(c.name, a.system_id)), a.system_id
    `).bind(userId).all(),
    client.prepare(`
      SELECT
        e.id,
        e.case_id,
        e.case_title_snapshot,
        e.system_id,
        COALESCE(c.name, e.system_id) AS system_name,
        e.completed_at,
        e.rating,
        e.content_mode,
        e.generation,
        e.review_sequence_epoch
      FROM scheduled_review_events e
      LEFT JOIN concepts c ON c.id = e.system_id AND c.kind = 'system'
      WHERE e.user_id = ?
      ORDER BY e.completed_at DESC, e.id DESC
      LIMIT ?
    `).bind(userId, historyLimit).all(),
    client.prepare(`
      SELECT
        b.system_id,
        COALESCE(c.name, b.system_id) AS system_name,
        b.month_start,
        b.scheduled_completed,
        b.scheduled_again,
        b.scheduled_hard,
        b.scheduled_good,
        b.scheduled_easy,
        b.first_completed_at,
        b.last_completed_at
      FROM learner_system_monthly_buckets b
      LEFT JOIN concepts c ON c.id = b.system_id AND c.kind = 'system'
      WHERE b.user_id = ?
      ORDER BY b.month_start, lower(COALESCE(c.name, b.system_id)), b.system_id
    `).bind(userId).all()
  ]);

  return {
    learner: {
      userId,
      name: String(learner.name ?? ''),
      email: String(learner.email ?? ''),
      accountCreatedAt: Number(learner.account_created_at ?? 0),
      detailedHistoryRetention: String(learner.detailed_history_retention),
      ...ratingShape(learner),
      freeCompleted: Number(learner.free_completed ?? 0),
      firstActivityAt: learner.first_activity_at == null ? null : Number(learner.first_activity_at),
      lastActivityAt: learner.last_activity_at == null ? null : Number(learner.last_activity_at),
      deletionPhase: learner.deletion_phase == null ? null : String(learner.deletion_phase)
    },
    systems: rows(systemLifetimeResult).map((row) => ({
      systemId: String(row.system_id),
      systemName: String(row.system_name),
      ...ratingShape(row),
      firstCompletedAt: row.first_completed_at == null ? null : Number(row.first_completed_at),
      lastCompletedAt: row.last_completed_at == null ? null : Number(row.last_completed_at)
    })),
    recentHistory: rows(historyResult).map((row) => ({
      id: String(row.id),
      caseId: String(row.case_id),
      caseTitle: String(row.case_title_snapshot),
      systemId: String(row.system_id),
      systemName: String(row.system_name),
      completedAt: Number(row.completed_at),
      rating: String(row.rating),
      contentMode: String(row.content_mode),
      generation: Number(row.generation),
      reviewSequenceEpoch: Number(row.review_sequence_epoch)
    })),
    monthlySystems: rows(monthlyResult).map((row) => ({
      systemId: String(row.system_id),
      systemName: String(row.system_name),
      monthStart: Number(row.month_start),
      month: monthLabel(row.month_start),
      ...ratingShape(row),
      firstCompletedAt: Number(row.first_completed_at),
      lastCompletedAt: Number(row.last_completed_at)
    }))
  };
}

const COHORT_MONTH_SQL = `CASE
  WHEN typeof(u.createdAt) IN ('integer', 'real')
    THEN strftime('%Y-%m', CAST(u.createdAt AS integer) / 1000, 'unixepoch')
  ELSE strftime('%Y-%m', u.createdAt)
END`;

/**
 * Long-range trend surfaces read only durable monthly buckets. They never scan
 * optimizer evidence and never reconstruct expired months from lifetime rows.
 */
export async function getAdminLearnerTrendSeries(db: import('./index.js').LearningDb) {
  const client = requireD1Client(db);
  const [systemResult, cohortResult] = await Promise.all([
    client.prepare(`
      SELECT
        b.system_id,
        COALESCE(c.name, b.system_id) AS system_name,
        b.month_start,
        SUM(b.scheduled_completed) AS scheduled_completed,
        SUM(b.scheduled_again) AS scheduled_again,
        SUM(b.scheduled_hard) AS scheduled_hard,
        SUM(b.scheduled_good) AS scheduled_good,
        SUM(b.scheduled_easy) AS scheduled_easy,
        COUNT(DISTINCT b.user_id) AS active_learners
      FROM learner_system_monthly_buckets b
      LEFT JOIN concepts c ON c.id = b.system_id AND c.kind = 'system'
      GROUP BY b.system_id, c.name, b.month_start
      ORDER BY b.month_start, lower(COALESCE(c.name, b.system_id)), b.system_id
    `).all(),
    client.prepare(`
      SELECT
        ${COHORT_MONTH_SQL} AS cohort_month,
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
    `).all()
  ]);

  return {
    cohortDefinition: 'learner_account_created_utc_month',
    systemMonthly: rows(systemResult).map((row) => ({
      systemId: String(row.system_id),
      systemName: String(row.system_name),
      monthStart: Number(row.month_start),
      month: monthLabel(row.month_start),
      ...ratingShape(row),
      activeLearners: Number(row.active_learners ?? 0)
    })),
    cohortMonthly: rows(cohortResult).map((row) => ({
      cohortMonth: String(row.cohort_month ?? ''),
      monthStart: Number(row.month_start),
      month: monthLabel(row.month_start),
      ...ratingShape(row),
      activeLearners: Number(row.active_learners ?? 0)
    }))
  };
}
