import { eq } from 'drizzle-orm';

import { learnerSystemAggregates, scheduledReviewEvents } from './fsrs-schema.js';

export type DurableFsrsSystemProvenance = {
  hasScheduledHistory: boolean;
  hasLearnerSystemAggregates: boolean;
  hasDurableHistory: boolean;
};

/**
 * Centralized current-cutover registry for durable learner-history tables whose
 * meaning depends on a Concept continuing to exist as a System.
 *
 * Later tranches that add another durable System-attribution table must extend
 * this function rather than inventing an independent deletion/reclassification
 * rule.
 */
export async function getDurableFsrsSystemProvenance(
  db: import('./index.js').LearningDb,
  systemId: string
): Promise<DurableFsrsSystemProvenance> {
  const [eventRows, aggregateRows] = await Promise.all([
    db.select({ id: scheduledReviewEvents.id })
      .from(scheduledReviewEvents)
      .where(eq(scheduledReviewEvents.systemId, systemId))
      .limit(1),
    db.select({ systemId: learnerSystemAggregates.systemId })
      .from(learnerSystemAggregates)
      .where(eq(learnerSystemAggregates.systemId, systemId))
      .limit(1)
  ]);
  const hasScheduledHistory = Boolean(eventRows[0]);
  const hasLearnerSystemAggregates = Boolean(aggregateRows[0]);
  return {
    hasScheduledHistory,
    hasLearnerSystemAggregates,
    hasDurableHistory: hasScheduledHistory || hasLearnerSystemAggregates
  };
}
