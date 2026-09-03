const DATABASE_NOW_MS_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";
export const DETAILED_HISTORY_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** @param {string} value @param {string} label */
function sqlAlias(value, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new TypeError(`${label} must be a simple SQL alias.`);
  }
  return value;
}

/**
 * SQL expression for the learner's human-readable Scheduled-history cutoff.
 * `indefinite` intentionally maps to the minimum signed 64-bit value so no
 * completed event can fall below the cutoff.
 *
 * @param {string} [profileAlias]
 */
export function detailedHistoryCutoffSql(profileAlias = 'p') {
  const p = sqlAlias(profileAlias, 'Profile alias');
  return `(CASE ${p}.detailed_history_retention
    WHEN '24m' THEN cast((julianday('now', '-24 months') - 2440587.5) * 86400000 as integer)
    WHEN '36m' THEN cast((julianday('now', '-36 months') - 2440587.5) * 86400000 as integer)
    WHEN '60m' THEN cast((julianday('now', '-60 months') - 2440587.5) * 86400000 as integer)
    ELSE -9223372036854775808
  END)`;
}

/**
 * Predicate used by learner-visible detailed history. Logical filtering remains
 * authoritative even when physical cleanup has not run yet.
 *
 * @param {string} [eventAlias]
 * @param {string} [profileAlias]
 */
export function retainedDetailedHistorySql(eventAlias = 'e', profileAlias = 'p') {
  const e = sqlAlias(eventAlias, 'Event alias');
  const p = sqlAlias(profileAlias, 'Profile alias');
  return `(${p}.detailed_history_retention = 'indefinite'
    OR ${e}.completed_at >= ${detailedHistoryCutoffSql(p)})`;
}

/**
 * Build one opportunistic cleanup pair. The DELETE removes only expired
 * human-readable Scheduled events; optimizer evidence, encounters and compact
 * aggregates are deliberately separate retention domains.
 *
 * `force` is used by Reset/Fresh because those operations already own a bounded
 * learner-scoped write transaction. Normal Scheduled completion throttles this
 * physical cleanup to at most once per day per learner while logical history
 * reads always apply the retention predicate immediately.
 *
 * @param {D1Database} client
 * @param {string} userId
 * @param {{force?:boolean}} [options]
 * @returns {D1PreparedStatement[]}
 */
export function buildDetailedHistoryCleanupStatements(client, userId, options = {}) {
  const force = options.force === true;
  const duePredicate = force
    ? '1 = 1'
    : `(p.last_detailed_cleanup_at IS NULL
      OR p.last_detailed_cleanup_at <= ${DATABASE_NOW_MS_SQL} - ${DETAILED_HISTORY_CLEANUP_INTERVAL_MS})`;
  const updateDuePredicate = force
    ? '1 = 1'
    : `(last_detailed_cleanup_at IS NULL
      OR last_detailed_cleanup_at <= ${DATABASE_NOW_MS_SQL} - ${DETAILED_HISTORY_CLEANUP_INTERVAL_MS})`;

  return [
    client.prepare(`
      DELETE FROM scheduled_review_events
      WHERE user_id = ?
        AND EXISTS (
          SELECT 1
          FROM learner_fsrs_profiles p
          WHERE p.user_id = ?
            AND p.detailed_history_retention <> 'indefinite'
            AND ${duePredicate}
            AND scheduled_review_events.completed_at < ${detailedHistoryCutoffSql('p')}
        )
    `).bind(userId, userId),
    client.prepare(`
      UPDATE learner_fsrs_profiles
      SET last_detailed_cleanup_at = ${DATABASE_NOW_MS_SQL},
          updated_at = ${DATABASE_NOW_MS_SQL}
      WHERE user_id = ?
        AND ${updateDuePredicate}
    `).bind(userId)
  ];
}
