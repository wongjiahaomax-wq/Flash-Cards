import { eq } from 'drizzle-orm';

import { learnerSystemMonthlyBuckets } from './fsrs-analytics-schema.js';
import { learnerSystemAggregates, scheduledReviewEvents } from './fsrs-schema.js';

export type DurableFsrsSystemProvenance = {
  hasScheduledHistory: boolean;
  hasLearnerSystemAggregates: boolean;
  hasMonthlyTrendBuckets: boolean;
  hasDurableHistory: boolean;
};

/**
 * Centralized registry for durable learner-history tables whose meaning depends
 * on a Concept continuing to exist as a System.
 *
 * Every tranche that adds durable System attribution must extend this function
 * rather than inventing an independent deletion/reclassification rule.
 */
export async function getDurableFsrsSystemProvenance(
  db: import('./index.js').LearningDb,
  systemId: string
): Promise<DurableFsrsSystemProvenance> {
  const [eventRows, aggregateRows, monthlyRows] = await Promise.all([
    db.select({ id: scheduledReviewEvents.id })
      .from(scheduledReviewEvents)
      .where(eq(scheduledReviewEvents.systemId, systemId))
      .limit(1),
    db.select({ systemId: learnerSystemAggregates.systemId })
      .from(learnerSystemAggregates)
      .where(eq(learnerSystemAggregates.systemId, systemId))
      .limit(1),
    db.select({ systemId: learnerSystemMonthlyBuckets.systemId })
      .from(learnerSystemMonthlyBuckets)
      .where(eq(learnerSystemMonthlyBuckets.systemId, systemId))
      .limit(1)
  ]);
  const hasScheduledHistory = Boolean(eventRows[0]);
  const hasLearnerSystemAggregates = Boolean(aggregateRows[0]);
  const hasMonthlyTrendBuckets = Boolean(monthlyRows[0]);
  return {
    hasScheduledHistory,
    hasLearnerSystemAggregates,
    hasMonthlyTrendBuckets,
    hasDurableHistory:
      hasScheduledHistory || hasLearnerSystemAggregates || hasMonthlyTrendBuckets
  };
}

/**
 * Boolean guard used by taxonomy write paths. Keep the detailed provenance
 * function above as the single registry owner so every caller evaluates the
 * same durable FSRS history tables.
 */
export async function hasFsrsSystemHistory(
  db: import('./index.js').LearningDb,
  systemId: string
): Promise<boolean> {
  return (await getDurableFsrsSystemProvenance(db, systemId)).hasDurableHistory;
}
