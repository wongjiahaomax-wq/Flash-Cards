export const LOCAL_LEARNER_RUNTIME_RESET_TABLES = Object.freeze([
  'scheduled_review_events',
  'free_review_completion_receipts',
  'active_review_questions',
  'active_review_assets',
  'active_reviews',
  // Legacy learner Review tables remain physically present only as zero-data
  // cutover sentinels. Local destructive refreshes must clear stale pre-cutover
  // rows before replacing content; normal learner runtime never writes them.
  'review_questions',
  'review_assets',
  'reviews',
  'learner_case_fsrs',
  'learner_case_encounters',
  'learner_optimizer_evidence',
  'learner_aggregates',
  'learner_system_aggregates'
]);

/**
 * Local content refresh is a destructive replica rebuild. Active Reviews,
 * retired legacy Review sentinels, and learner progress derived from the old
 * content snapshot must be removed before Cases/Assets/Concepts are replaced,
 * otherwise learner-history foreign keys intentionally prevent the content
 * reset.
 *
 * Better Auth identity, learner preferences, and the learner FSRS profile are
 * deliberately not included here. Their reset semantics belong to later FSRS
 * reset/retention tranches, not this cutover.
 */
export function buildLocalLearnerRuntimeResetSql() {
  return [
    '-- Generated local-only learner runtime reset. Auth identity/settings are preserved.',
    ...LOCAL_LEARNER_RUNTIME_RESET_TABLES.map((table) => `DELETE FROM \`${table}\`;`),
    ''
  ].join('\n');
}
